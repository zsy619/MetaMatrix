package base

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
)

func uuidMustParse(s string) uuid.UUID { return uuid.MustParse(s) }

func jsonUnmarshalMap(raw []byte, out *map[string]any) error {
	return json.Unmarshal(raw, out)
}

// D2：TODAY() 这类时间敏感公式要「按天重算 + 惰性补算」。
func TestTimeSensitiveFormulaDetection(t *testing.T) {
	if !expressionIsTimeSensitive("TODAY()") {
		t.Fatal("TODAY() 应被识别为时间敏感")
	}
	if !expressionIsTimeSensitive("today() + 1") {
		t.Fatal("大小写不同的 today() 也应被识别")
	}
	if expressionIsTimeSensitive("SUM({金额}) * 2") {
		t.Fatal("普通公式不应被识别为时间敏感")
	}
}

// 惰性补算：跨天后第一次查询会触发重算，把 TODAY() 的值刷新成当天。
func TestLazyTimeRecalcRefreshesTodayValue(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()

	formula, err := f.svc.CreateField(ctx, f.userA, f.projectID, f.tableID, FieldInput{Name: "今天", Type: "formula"})
	if err != nil {
		t.Fatalf("create formula field failed: %v", err)
	}
	if err := f.svc.SaveFormula(ctx, f.userA, f.projectID, uuidMustParse(formula.ID), "TODAY()"); err != nil {
		t.Fatalf("save formula failed: %v", err)
	}
	rec, err := f.svc.CreateRecord(ctx, f.userA, f.projectID, f.tableID, RecordInput{
		Fields: map[string]any{f.fieldA.String(): "x"},
	})
	if err != nil {
		t.Fatalf("create record failed: %v", err)
	}
	// 模拟「昨天算过」：把表的按天重算标记挪到昨天。
	timeRecalc.mu.Lock()
	timeRecalc.days[f.tableID] = "2000-01-01"
	timeRecalc.mu.Unlock()

	if !f.svc.NeedsTimeRecalc(f.tableID) {
		t.Fatal("标记为昨天后应需要补算")
	}
	if err := f.svc.EnsureTableTimeRecalc(ctx, f.tableID); err != nil {
		t.Fatalf("lazy recalc failed: %v", err)
	}
	if f.svc.NeedsTimeRecalc(f.tableID) {
		t.Fatal("补算后应标记为今天")
	}
	// 值应当被写成今天的日期。
	var row BaseRecord
	if err := f.db.Where("id = ?", rec.ID).First(&row).Error; err != nil {
		t.Fatalf("load record failed: %v", err)
	}
	data := map[string]any{}
	if err := jsonUnmarshalMap(row.Data, &data); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	value, _ := data[formula.ID].(string)
	if value == "" {
		t.Fatalf("公式值应被回填，实际 %+v", data)
	}
}

// 不含时间函数的表不应该被重算（避免无谓的写放大）。
func TestEnsureTimeRecalcSkipsNormalTables(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()
	formula, err := f.svc.CreateField(ctx, f.userA, f.projectID, f.tableID, FieldInput{Name: "合计", Type: "formula"})
	if err != nil {
		t.Fatalf("create formula field failed: %v", err)
	}
	if err := f.svc.SaveFormula(ctx, f.userA, f.projectID, uuidMustParse(formula.ID), "SUM({字段A})"); err != nil {
		t.Fatalf("save formula failed: %v", err)
	}
	timeRecalc.mu.Lock()
	timeRecalc.days[f.tableID] = "2000-01-01"
	timeRecalc.mu.Unlock()
	if err := f.svc.EnsureTableTimeRecalc(ctx, f.tableID); err != nil {
		t.Fatalf("lazy recalc failed: %v", err)
	}
	if f.svc.NeedsTimeRecalc(f.tableID) {
		t.Fatal("普通公式表补算后也应标记为已处理（避免每次查询都扫一遍）")
	}
}
