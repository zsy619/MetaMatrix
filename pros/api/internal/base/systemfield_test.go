package base

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// 系统字段：创建时间 / 更新时间 / 创建人 / 更新人。
func TestSystemFieldsAreMaintainedByServer(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()

	createdAt, err := f.svc.CreateField(ctx, f.userA, f.projectID, f.tableID, FieldInput{Name: "创建时间", Type: string(FieldCreatedAt)})
	if err != nil {
		t.Fatalf("创建创建时间字段失败：%v", err)
	}
	updatedAt, err := f.svc.CreateField(ctx, f.userA, f.projectID, f.tableID, FieldInput{Name: "更新时间", Type: string(FieldUpdatedAt)})
	if err != nil {
		t.Fatalf("创建更新时间字段失败：%v", err)
	}
	createdBy, err := f.svc.CreateField(ctx, f.userA, f.projectID, f.tableID, FieldInput{Name: "创建人", Type: string(FieldCreatedBy)})
	if err != nil {
		t.Fatalf("创建创建人字段失败：%v", err)
	}
	updatedBy, err := f.svc.CreateField(ctx, f.userA, f.projectID, f.tableID, FieldInput{Name: "更新人", Type: string(FieldUpdatedBy)})
	if err != nil {
		t.Fatalf("创建更新人字段失败：%v", err)
	}

	// 客户端伪造的值必须被忽略（系统字段由服务端维护）。
	rec, err := f.svc.CreateRecord(ctx, f.userA, f.projectID, f.tableID, RecordInput{
		Fields: map[string]any{
			createdBy.ID: "伪造的创建人",
			updatedBy.ID: "伪造的更新人",
		},
	})
	if err != nil {
		t.Fatalf("创建记录失败：%v", err)
	}

	assertField := func(row *RecordRow, fieldID, want string) {
		t.Helper()
		got, ok := row.Fields[fieldID]
		if !ok {
			t.Fatalf("系统字段 %s 缺值", fieldID)
		}
		if got != want {
			t.Fatalf("系统字段 %s = %v，期望 %v", fieldID, got, want)
		}
	}

	assertField(rec, createdBy.ID, f.userA.String())
	assertField(rec, updatedBy.ID, f.userA.String())
	if v, _ := rec.Fields[createdAt.ID].(string); v == "" {
		t.Fatal("创建时间字段为空")
	}
	if v, _ := rec.Fields[updatedAt.ID].(string); v == "" {
		t.Fatal("更新时间字段为空")
	}

	// 换人编辑：更新人应变成 userB，创建人 / 创建时间保持不变。
	// 系统字段的秒级精度要求跨秒再改，否则「创建时间 == 更新时间」无法区分。
	time.Sleep(1100 * time.Millisecond)
	updated, err := f.svc.UpdateRecord(ctx, f.userB, f.projectID, rec.ID, RecordInput{
		Fields: map[string]any{},
	})
	if err != nil {
		t.Fatalf("更新记录失败：%v", err)
	}
	assertField(updated, updatedBy.ID, f.userB.String())
	assertField(updated, createdBy.ID, f.userA.String())
	assertField(updated, createdAt.ID, valueToText(rec.Fields[createdAt.ID]))
	if updated.Fields[updatedAt.ID] == rec.Fields[updatedAt.ID] {
		t.Fatal("更新时间在编辑后应当刷新")
	}

	// 值要落到记录 JSON 里（能进投影，才能筛选 / 排序）。
	var stored BaseRecord
	if err := f.db.WithContext(ctx).Where("id = ?", rec.ID).First(&stored).Error; err != nil {
		t.Fatalf("读取记录失败：%v", err)
	}
	data := map[string]any{}
	_ = json.Unmarshal(stored.Data, &data)
	if data[createdBy.ID] != f.userA.String() {
		t.Fatalf("落库的创建人 = %v，期望 %v", data[createdBy.ID], f.userA.String())
	}
}

// 系统字段不能迁成普通字段，普通字段也不能迁成系统字段。
func TestSystemFieldTypeMigrationRejected(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()

	field, err := f.svc.CreateField(ctx, f.userA, f.projectID, f.tableID, FieldInput{Name: "创建人", Type: string(FieldCreatedBy)})
	if err != nil {
		t.Fatalf("创建系统字段失败：%v", err)
	}
	if _, err := f.svc.MigrateField(ctx, f.userA, f.projectID, uuid.MustParse(field.ID), string(FieldText)); err == nil {
		t.Fatal("系统字段迁成普通字段应当报错")
	}
	if _, err := f.svc.MigrateField(ctx, f.userA, f.projectID, f.fieldA, string(FieldCreatedAt)); err == nil {
		t.Fatal("普通字段迁成系统字段应当报错")
	}
}

// 系统字段必须是只读计算字段：定义里 Computed=true、Editable=false。
func TestSystemFieldCapabilities(t *testing.T) {
	reg := NewRegistry()
	for _, typ := range []FieldType{FieldCreatedAt, FieldUpdatedAt, FieldCreatedBy, FieldUpdatedBy} {
		h, ok := reg.Get(typ)
		if !ok {
			t.Fatalf("未注册字段类型 %s", typ)
		}
		def := h.Definition()
		if !def.Capabilities.Computed {
			t.Errorf("%s 应为计算字段", typ)
		}
		if def.Capabilities.Editable {
			t.Errorf("%s 不应可编辑", typ)
		}
		if !def.Capabilities.Filterable || !def.Capabilities.Sortable {
			t.Errorf("%s 应可筛选可排序", typ)
		}
	}
	// 投影类型：时间是 date，人是 text。
	reg2 := NewRegistry()
	if h, _ := reg2.Get(FieldCreatedAt); h.ProjectedType() != ProjectedDate {
		t.Errorf("创建时间投影类型 = %s，期望 %s", h.ProjectedType(), ProjectedDate)
	}
	if h, _ := reg2.Get(FieldUpdatedBy); h.ProjectedType() != ProjectedText {
		t.Errorf("更新人投影类型 = %s，期望 %s", h.ProjectedType(), ProjectedText)
	}
}

// 公式可以引用系统字段（创建时间在数据里先于公式落库）。
func TestFormulaCanReferenceSystemField(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()

	createdAt, err := f.svc.CreateField(ctx, f.userA, f.projectID, f.tableID, FieldInput{Name: "创建时间", Type: string(FieldCreatedAt)})
	if err != nil {
		t.Fatalf("创建系统字段失败：%v", err)
	}
	formula, err := f.svc.CreateField(ctx, f.userA, f.projectID, f.tableID, FieldInput{Name: "创建年份", Type: string(FieldFormula)})
	if err != nil {
		t.Fatalf("创建公式字段失败：%v", err)
	}
	if err := f.svc.SaveFormula(ctx, f.userA, f.projectID, uuid.MustParse(formula.ID), "YEAR({创建时间})"); err != nil {
		t.Fatalf("保存公式失败：%v", err)
	}
	rec, err := f.svc.CreateRecord(ctx, f.userA, f.projectID, f.tableID, RecordInput{Fields: map[string]any{}})
	if err != nil {
		t.Fatalf("创建记录失败：%v", err)
	}
	year, ok := rec.Fields[formula.ID]
	if !ok {
		t.Fatalf("公式字段缺值")
	}
	if !strings.Contains(valueToText(year), "20") {
		t.Fatalf("公式结果 = %v，期望年份", year)
	}
	_ = createdAt
}

var _ = gorm.ErrRecordNotFound
