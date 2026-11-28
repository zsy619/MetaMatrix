package base

import (
	"context"
	"strings"

	"github.com/google/uuid"
)

// 关键字搜索的 SQL 编译。
//
// 旧实现有三个问题，实测「常规筛选（关键字）」P50 304ms / P95 607ms：
//
//  1. **条件被编译了两次**：计数查询与取数查询各调一次 keywordCondition，
//     「按文档标题找节点」的库查询也跟着跑了两遍 —— 同样的活干两倍。
//  2. **分支恒定存在**：不管表里有没有 JSON 类字段，
//     都会拼一条 `value_json::text ILIKE ?` —— 每行都要把 JSON 序列化成文本再比，
//     这是最贵的一段，而绝大多数表根本没有附件 / 成员 / 关联字段。
//  3. **相关子查询 + 每节点一个 EXISTS**：`EXISTS (... WHERE v.record_id = r.id ...)`
//     对每条记录都跑一遍子查询；文档标题分支更是「命中节点数」个 EXISTS，
//     最多 20 个。改成半连接（`r.id IN (SELECT record_id ...)`）后，
//     数据库只需要扫一次投影表。
//
// 新实现：条件只编译一次、只保留表里真实存在的分支、全部走半连接。

// compileKeyword 编译关键字搜索条件（一次查询只编译一次，计数与取数共用）。
//
// 第三个返回值是「完整命中集合」：非 nil 时表示这次关键字搜索的命中记录
// **已经全部拿到手**（快路径探测没探到上限），调用方可以直接用这个集合
// 算总数，不必再跑一次全表 COUNT（P-02）。
// nil 表示命中集合不完整（JSON 分支 / 关联文档分支），按老路走精确 COUNT。
func (s *Service) compileKeyword(
	ctx context.Context,
	projectID, tableID uuid.UUID,
	idx *fieldIndex,
	kw string,
) (string, []any, []uuid.UUID) {
	kw = strings.TrimSpace(kw)
	if kw == "" {
		return "", nil, nil
	}
	like := "%" + escapeLike(kw) + "%"
	textIDs, jsonIDs := keywordFieldIDs(idx)
	if len(textIDs) == 0 && len(jsonIDs) == 0 {
		return "", nil, nil
	}
	// 「纯文本搜索」走候选集快路径：
	// 先探一次（带上限），能确定命中集合时直接用记录 ID，
	// 主查询退化成主键扫描；探不到上限就回落到半连接。
	//
	// 有 JSON 分支或「按文档标题」分支时不走快路径 ——
	// 候选集只覆盖文本字段，不完整，用了会漏结果。
	if len(textIDs) > 0 && len(jsonIDs) == 0 && len(s.docFieldIDs(idx)) == 0 {
		if cond, args, ids, ok := s.keywordCandidateCondition(ctx, tableID, textIDs, like); ok {
			return cond, args, ids
		}
	}
	parts := make([]string, 0, 3)
	args := make([]any, 0, 8)
	// 文本投影：普通文本 / 长文本 / 单选 / 公式 / 关联文档 / 联系人。
	//
	// **JSON 投影（附件 / 成员 / 关联记录）也归到这里** ——
	// 它们的可搜内容（文件名 / 成员 ID / 关联记录 ID）已经由
	// `projectionRow` 顺手落进 value_text，
	// 于是可以跟着文本字段一起走 GIN 三值组索引。
	//
	// 旧实现对 JSON 走的是 `value_json::text ILIKE ?`：
	// 每行都要把 JSONB 序列化成文本再比，而且**走不了任何索引**
	//（`jsonb::text` 不是 IMMUTABLE，建不了表达式索引）——
	// 这是整个检索路径上最贵的一段。现在它整条消失了。
	if len(textIDs) > 0 {
		parts = append(parts, "r.id IN (SELECT v.record_id FROM base_record_values v WHERE v.table_id = ? AND v.field_id IN ? AND v.value_text ILIKE ?)")
		args = append(args, tableID, textIDs, like)
	}
	// 「关联文档」按**文档标题**检索：先在目录树里找标题命中的节点，
	// 再回表匹配 doc 字段的投影值。
	docIDs := s.docFieldIDs(idx)
	if len(docIDs) > 0 {
		nodeIDs := s.docKeywordNodeIDs(ctx, projectID, kw)
		if len(nodeIDs) > 0 {
			branch, branchArgs := buildDocTitleBranch(tableID, docIDs, nodeIDs)
			parts = append(parts, branch)
			args = append(args, branchArgs...)
		}
	}
	if len(parts) == 0 {
		return "", nil, nil
	}
	return "(" + strings.Join(parts, " OR ") + ")", args, nil
}

// keywordCandidateCap 是「候选集快路径」能接纳的最大命中行数。
//
// 超过这个数就说明命中面很大 —— 此时半连接才是对的计划，
// 硬把 ID 塞进 IN 列表既慢又不准。
const keywordCandidateCap = 2000

// keywordCandidateCondition 用「带上限的探测」拿到命中记录集合。
//
// 为什么要这一步：半连接版本每次关键字搜索都要扫一遍本表全部投影行
// （`value_text ILIKE '%kw%'` 走不了 B-tree），实测 5 万行的表里
// 「搜不到任何结果」也要 41ms —— 而这次搜索毫无产出。
//
// 探测用 `LIMIT cap+1`：
//   - 一行都没探到 → 确实没有命中，直接返回恒假条件，主查询空转；
//   - 探到不超过 cap 行 → 这就是**全部**命中行（没触发 LIMIT），
//     去重后就是完整命中集合，主查询退化成主键扫描；
//   - 探满了 cap+1 行 → 命中面太大，回落半连接。
//
// 正确性前提：只有「没触发 LIMIT」时才能认定集合完整，
// 所以上限判断用的是探到的行数而不是去重后的数量 —— 去重只会更少，
// 用原始行数判断更保守。
func (s *Service) keywordCandidateCondition(ctx context.Context, tableID uuid.UUID, textIDs []uuid.UUID, like string) (string, []any, []uuid.UUID, bool) {
	type candidate struct {
		RecordID uuid.UUID `gorm:"column:record_id"`
	}
	var rows []candidate
	if err := s.db.WithContext(ctx).
		Raw("SELECT record_id FROM base_record_values WHERE table_id = ? AND field_id IN ? AND value_text ILIKE ? LIMIT ?",
			tableID, textIDs, like, keywordCandidateCap+1).
		Scan(&rows).Error; err != nil {
		// 探测失败（表不存在 / 索引缺失等）→ 老老实实走半连接。
		return "", nil, nil, false
	}
	if len(rows) == 0 {
		// 没有任何命中：恒假条件，主查询直接空转。
		// 命中集合是「空集」（非 nil）—— 调用方据此知道总数就是 0，
		// 不必再跑一次 COUNT。
		return "1 = 0", nil, []uuid.UUID{}, true
	}
	if len(rows) > keywordCandidateCap {
		// 命中面太大：回落到半连接。
		return "", nil, nil, false
	}
	// 没触发 LIMIT → 探到的就是全部命中行；去重后是完整命中集合。
	seen := make(map[uuid.UUID]bool, len(rows))
	ids := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		if row.RecordID == uuid.Nil || seen[row.RecordID] {
			continue
		}
		seen[row.RecordID] = true
		ids = append(ids, row.RecordID)
	}
	if len(ids) == 0 {
		return "1 = 0", nil, []uuid.UUID{}, true
	}
	// 「r.id IN ?」把完整命中集合交给调用方：
	// 总数可以直接按这个集合点查出来，省掉一次全表 COUNT。
	return "r.id IN ?", []any{ids}, ids, true
}

// buildDocTitleBranch 编译「按文档标题命中」的分支。
//
// 节点 ID 合成一个 ARRAY + ILIKE ANY：一条半连接覆盖所有节点，
// 旧实现是「每个节点一个 EXISTS」（最多 20 个子查询）。
func buildDocTitleBranch(tableID uuid.UUID, docFieldIDs []uuid.UUID, nodeIDs []string) (string, []any) {
	if len(docFieldIDs) == 0 || len(nodeIDs) == 0 {
		return "", nil
	}
	placeholders := make([]string, 0, len(nodeIDs))
	docArgs := make([]any, 0, len(nodeIDs))
	for _, nodeID := range nodeIDs {
		placeholders = append(placeholders, "?")
		docArgs = append(docArgs, "%"+escapeLike(nodeID)+"%")
	}
	cond := "r.id IN (SELECT dv.record_id FROM base_record_values dv WHERE dv.table_id = ? AND dv.field_id IN ? AND dv.value_text ILIKE ANY (ARRAY[" + strings.Join(placeholders, ",") + "]))"
	return cond, append([]any{tableID, docFieldIDs}, docArgs...)
}

// keywordFieldIDs 拆出「文本投影字段」与「JSON 投影字段」。
//
// 只有 ProjectedText 的字段会写 value_text；数字 / 日期 / 布尔只写各自的类型列，
// value_text 恒为空 —— 把它们放进搜索范围既搜不到东西，又要多扫一遍投影。
//
// **JSON 投影字段也算文本可搜**：`projectionRow` 给它们额外落了一份
// 可搜文本（附件名 / 成员 ID / 关联记录 ID）到 value_text，
// 所以检索时它们与文本字段走同一条（可走索引的）分支。
//
// jsonIDs 仍然返回 —— 调用方用它判断「命中集合是否完整」
// （JSON 字段的可搜文本是**投影时快照**，不是实时值，
// 严格说与实时 JSON 内容可能有出入，所以不进入「完整命中集合」快路径）。
func keywordFieldIDs(idx *fieldIndex) (textIDs []uuid.UUID, jsonIDs []uuid.UUID) {
	textIDs = make([]uuid.UUID, 0, len(idx.byID))
	jsonIDs = make([]uuid.UUID, 0, 2)
	for id := range idx.byID {
		handler, ok := idx.handler(id)
		if !ok {
			continue
		}
		switch handler.ProjectedType() {
		case ProjectedJSON:
			// 走文本分支（可搜文本已落到 value_text），但仍记进 jsonIDs：
			// 命中集合不再算「完整」，避免快路径漏结果。
			jsonIDs = append(jsonIDs, id)
			textIDs = append(textIDs, id)
		case ProjectedText:
			textIDs = append(textIDs, id)
		}
	}
	return textIDs, jsonIDs
}
