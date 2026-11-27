package model

import (
	"fmt"
	"strings"
)

// 表命名域：全库只允许这四个域前缀，新增表必须归入其一。
//
// 规范见 docs/db-table-naming.md；守卫测试见 table_naming_test.go。
// 任何智能体（Claude Code / Codex / Grok / Hermes / DeepSeek 等）新增或修改表时，
// 都必须遵守这里的规则，并由守卫测试在 CI 里拦住违规改动。
const (
	DomainCore  = "core"
	DomainKB    = "kb"
	DomainBase  = "base"
	DomainMedia = "media"
)

// TableDomains 是允许的域前缀白名单。
var TableDomains = []string{DomainCore, DomainKB, DomainBase, DomainMedia}

// TableEntry 描述一张登记在册的表。
type TableEntry struct {
	// Name 是物理表名（= 域前缀 + 实体名复数）。
	Name string `json:"name"`
	// Domain 是所属域。
	Domain string `json:"domain"`
	// Purpose 是一句话用途说明。
	Purpose string `json:"purpose"`
	// Model 是对应的 Go 结构体名。
	Model string `json:"model"`
	// MassNoun 表示实体名是不可数名词（node_data、presence），
	// 这类表名不强制以 s 结尾；白名单只在这里维护。
	MassNoun bool `json:"massNoun,omitempty"`
}

// TableRegistry 是全库表的单一事实源。
//
// 新增表时必须同时做三件事：
//  1. 在本表登记一行；
//  2. 在 model 里显式写 TableName()；
//  3. 跑 go test ./internal/model/... ./internal/db/... 让守卫测试放行。
var TableRegistry = []TableEntry{
	{Name: "core_activity_logs", Domain: "core", Purpose: "操作审计留痕（登录、退出、写操作）", Model: "ActivityLog"},
	{Name: "core_backup_imports", Domain: "core", Purpose: "备份导入批次记录", Model: "BackupImport"},
	{Name: "core_page_references", Domain: "core", Purpose: "文档反向引用索引（@提及 / 内嵌块）", Model: "PageReference"},
	{Name: "core_password_reset_tokens", Domain: "core", Purpose: "密码重置令牌与会话", Model: "PasswordResetToken"},
	{Name: "core_projects", Domain: "core", Purpose: "项目：画布/文档的归属分组", Model: "Project"},
	{Name: "core_user_notifications", Domain: "core", Purpose: "站内通知（评论/回复/@）", Model: "UserNotification"},
	{Name: "core_users", Domain: "core", Purpose: "账号（登录、密码重置、目录通讯录）", Model: "User"},
	{Name: "kb_chunks", Domain: "kb", Purpose: "向量检索切片", Model: "KnowledgeChunk"},
	{Name: "kb_comment_reads", Domain: "kb", Purpose: "评论已读位", Model: "DocCommentRead"},
	{Name: "kb_comments", Domain: "kb", Purpose: "文档评论与回复", Model: "DocComment"},
	{Name: "kb_content_blocks", Domain: "kb", Purpose: "正文结构块索引（检索与 AI 上下文）", Model: "CanvasContentBlock"},
	{Name: "kb_crdt_updates", Domain: "kb", Purpose: "协同编辑增量（Yjs / CRDT）", Model: "DocCRDTUpdate"},
	{Name: "kb_doc_audit_events", Domain: "kb", Purpose: "用户+文档级审计（谁在何时改了哪个块）", Model: "DocAuditEvent"},
	{Name: "kb_doc_block_refs", Domain: "kb", Purpose: "块级引用反查", Model: "DocBlockRef"},
	{Name: "kb_doc_block_revisions", Domain: "kb", Purpose: "块修订历史", Model: "DocBlockRevision"},
	{Name: "kb_doc_blocks", Domain: "kb", Purpose: "正文派生块表（稳定 data-block-id，含块级权限）", Model: "DocBlock"},
	{Name: "kb_doc_operations", Domain: "kb", Purpose: "正文 Yjs 协同操作日志（不是保存幂等的 kb_save_operations）", Model: "DocOperation"},
	{Name: "kb_doc_properties", Domain: "kb", Purpose: "文档页面属性（状态、负责人、标签、封面）", Model: "DocProperty"},
	{Name: "kb_doc_versions", Domain: "kb", Purpose: "文档历史版本快照（可读可对比）", Model: "KnowledgeDocVersion"},
	{Name: "kb_documents", Domain: "kb", Purpose: "文档正文真源（doc / canvas / mindmap / sheet）", Model: "CanvasDocument"},
	{Name: "kb_events", Domain: "kb", Purpose: "知识库变更事件流", Model: "KnowledgeEvent"},
	{Name: "kb_members", Domain: "kb", Purpose: "空间成员与角色", Model: "KnowledgeMember"},
	{Name: "kb_node_data", Domain: "kb", Purpose: "节点结构化数据（思维导图、表格等）", Model: "KnowledgeNodeData", MassNoun: true},
	{Name: "kb_nodes", Domain: "kb", Purpose: "知识库目录树节点（folder / doc）", Model: "KnowledgeNode"},
	{Name: "kb_presence", Domain: "kb", Purpose: "在线状态与协同 presence", Model: "KnowledgePresence", MassNoun: true},
	{Name: "kb_revisions", Domain: "kb", Purpose: "文档修订历史快照", Model: "CanvasRevision"},
	{Name: "kb_save_operations", Domain: "kb", Purpose: "保存幂等记录（operationId 去重）", Model: "DocumentSaveOperation"},
	{Name: "kb_shares", Domain: "kb", Purpose: "文档与节点分享链接", Model: "KnowledgeShare"},
	{Name: "kb_tags", Domain: "kb", Purpose: "业务标签词库", Model: "KnowledgeTagDict"},
	{Name: "kb_templates", Domain: "kb", Purpose: "文档模板（内置 / 团队 / 个人）", Model: "KnowledgeTemplate"},
	{Name: "kb_views", Domain: "kb", Purpose: "最近浏览记录", Model: "KnowledgeView"},
	{Name: "base_apps", Domain: "base", Purpose: "多维表格应用（Base）", Model: "BaseApp"},
	{Name: "base_event_outboxes", Domain: "base", Purpose: "多维表格事件发件箱", Model: "BaseEventOutbox"},
	{Name: "base_field_formulas", Domain: "base", Purpose: "字段公式定义", Model: "BaseFieldFormula"},
	{Name: "base_fields", Domain: "base", Purpose: "多维表格字段", Model: "BaseField"},
	{Name: "base_formula_dependencies", Domain: "base", Purpose: "公式依赖图", Model: "BaseFormulaDependency"},
	{Name: "base_operation_logs", Domain: "base", Purpose: "多维表格操作审计", Model: "BaseOperationLog"},
	{Name: "base_record_links", Domain: "base", Purpose: "记录关联关系", Model: "BaseRecordLink"},
	{Name: "base_record_values", Domain: "base", Purpose: "记录的类型化投影值", Model: "BaseRecordValue"},
	{Name: "base_records", Domain: "base", Purpose: "多维表格记录", Model: "BaseRecord"},
	{Name: "base_tables", Domain: "base", Purpose: "多维表格数据表", Model: "BaseTable"},
	{Name: "base_views", Domain: "base", Purpose: "多维表格视图（网格 / 看板 / 画廊）", Model: "BaseView"},
	{Name: "media_assets", Domain: "media", Purpose: "素材文件（图片、音视频等）", Model: "MediaAsset"},
	{Name: "media_categories", Domain: "media", Purpose: "素材分类", Model: "MediaCategory"},
	{Name: "media_references", Domain: "media", Purpose: "素材被引用关系", Model: "MediaReference"},
}

// DomainOfTable 返回表名所属的域。
func DomainOfTable(name string) (string, bool) {
	for _, d := range TableDomains {
		if strings.HasPrefix(name, d+"_") {
			return d, true
		}
	}
	return "", false
}

// ValidateTableName 按全局规则校验表名：
//
//  1. 域前缀必须在白名单内（core_ / kb_ / base_ / media_）；
//  2. 实体名必须是复数（以 s 结尾）；
//  3. 表名必须已在 TableRegistry 登记。
func ValidateTableName(name string) error {
	if name == "" {
		return fmt.Errorf("表名为空")
	}
	domain, ok := DomainOfTable(name)
	if !ok {
		return fmt.Errorf("表名 %q 的域前缀不在白名单 %v 内", name, TableDomains)
	}
	entity := strings.TrimPrefix(name, domain+"_")
	if entity == "" {
		return fmt.Errorf("表名 %q 缺少实体名", name)
	}
	for _, e := range TableRegistry {
		if e.Name != name {
			continue
		}
		if strings.HasSuffix(entity, "s") {
			return nil
		}
		if e.MassNoun {
			return nil
		}
		return fmt.Errorf("表名 %q 的实体名必须是复数（以 s 结尾）；"+
			"确实是不可数实体时，请在 TableRegistry 里标注 MassNoun", name)
	}
	return fmt.Errorf("表名 %q 未在 model.TableRegistry 登记", name)
}
