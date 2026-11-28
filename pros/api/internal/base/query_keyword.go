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
func (s *Service) compileKeyword(
	ctx context.Context,
	projectID, tableID uuid.UUID,
	idx *fieldIndex,
	kw string,
) (string, []any) {
	kw = strings.TrimSpace(kw)
	if kw == "" {
		return "", nil
	}
	like := "%" + escapeLike(kw) + "%"
	textIDs, jsonIDs := keywordFieldIDs(idx)
	if len(textIDs) == 0 && len(jsonIDs) == 0 {
		return "", nil
	}
	parts := make([]string, 0, 3)
	args := make([]any, 0, 8)
	// 文本投影：普通文本 / 长文本 / 单选 / 公式 / 关联文档 / 联系人。
	if len(textIDs) > 0 {
		parts = append(parts, "r.id IN (SELECT v.record_id FROM base_record_values v WHERE v.table_id = ? AND v.field_id IN ? AND v.value_text ILIKE ?)")
		args = append(args, tableID, textIDs, like)
	}
	// JSON 投影：附件 / 成员 / 关联记录等（值里带文件名或 ID）。
	//
	// 只有表里真的存在 JSON 字段时才拼这一支：没有就直接省掉，
	// 这是最贵的一段（每行都要把 JSON 序列化成文本）。
	if len(jsonIDs) > 0 {
		parts = append(parts, "r.id IN (SELECT vj.record_id FROM base_record_values vj WHERE vj.table_id = ? AND vj.field_id IN ? AND vj.value_json IS NOT NULL AND vj.value_json::text ILIKE ?)")
		args = append(args, tableID, jsonIDs, like)
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
		return "", nil
	}
	return "(" + strings.Join(parts, " OR ") + ")", args
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
			jsonIDs = append(jsonIDs, id)
		case ProjectedText:
			textIDs = append(textIDs, id)
		}
	}
	return textIDs, jsonIDs
}
