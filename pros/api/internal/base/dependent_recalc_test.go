package base

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"
)

// TestDependentRecalcRunsAfterWrite 回归「引用 / 汇总字段写入后不自动重算」。
//
// 旧实现里 `scheduleDependentRecalc` 是**死代码**（全仓无调用点）：
// 改了目标表的记录之后，引用 / 汇总列一直停在旧值，
// 只有用户手点「重算」按钮才会更新。
//
// 本用例验证：改目标表 → 依赖表里的引用字段**自动**变新值。
func TestDependentRecalcRunsAfterWrite(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()

	// 目标表 A（fixture 自带的表），字段 A 是文本字段。
	target, err := f.svc.CreateRecord(ctx, f.userA, f.projectID, f.tableID, RecordInput{
		Fields: map[string]any{f.fieldA.String(): "旧值"},
	})
	if err != nil {
		t.Fatalf("创建目标记录失败：%v", err)
	}

	// 依赖表 B：关联字段 → A，引用字段 → A 的字段 A。
	tableB, err := f.svc.CreateTable(ctx, f.userA, f.projectID, f.baseID, "依赖表", "")
	if err != nil {
		t.Fatalf("建依赖表失败：%v", err)
	}
	linkField, err := f.svc.CreateField(ctx, f.userA, f.projectID, tableB.ID, FieldInput{
		Name: "关联", Type: string(FieldLink),
		Config: map[string]any{"targetTableId": f.tableID.String()},
	})
	if err != nil {
		t.Fatalf("建关联字段失败：%v", err)
	}
	lookupField, err := f.svc.CreateField(ctx, f.userA, f.projectID, tableB.ID, FieldInput{
		Name: "引用", Type: string(FieldLookup),
		Config: map[string]any{
			"targetTableId": f.tableID.String(),
			"targetFieldId": f.fieldA.String(),
			"linkFieldId":   linkField.ID,
		},
	})
	if err != nil {
		t.Fatalf("建引用字段失败：%v", err)
	}
	linked, err := f.svc.CreateRecord(ctx, f.userA, f.projectID, tableB.ID, RecordInput{
		Fields: map[string]any{linkField.ID: []string{target.ID.String()}},
	})
	if err != nil {
		t.Fatalf("创建依赖记录失败：%v", err)
	}

	// 改目标表记录 → 应触发依赖重算。
	if _, err := f.svc.UpdateRecord(ctx, f.userA, f.projectID, target.ID, RecordInput{
		Fields: map[string]any{f.fieldA.String(): "新值"},
	}); err != nil {
		t.Fatalf("更新目标记录失败：%v", err)
	}

	// 自动重算是异步的，轮询等它生效。
	deadline := time.Now().Add(20 * time.Second)
	var last any
	for time.Now().Before(deadline) {
		row, err := f.svc.scopeLoadRecord(ctx, f.userA, f.projectID, linked.ID)
		if err != nil {
			t.Fatalf("读取依赖记录失败：%v", err)
		}
		data := map[string]any{}
		if len(row.Data) > 0 {
			_ = json.Unmarshal(row.Data, &data)
		}
		last = data[lookupField.ID]
		if fmtValues(last) == "新值" {
			return
		}
		time.Sleep(300 * time.Millisecond)
	}
	t.Fatalf("引用字段未自动重算，实际值：%v", last)
}

// fmtValues 把引用字段的值渲染成可比较的字符串。
func fmtValues(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case []any:
		if len(t) == 0 {
			return ""
		}
		return fmt.Sprint(t[0])
	case string:
		return t
	default:
		return fmt.Sprint(v)
	}
}
