package base

import (
	"context"
	"testing"
)

// E-03：跨表复制 / 移动记录。
func TestTransferRecordAcrossTables(t *testing.T) {
	f := newSummaryFixture(t)
	ctx := context.Background()

	// 源表：客户（文本）+ 金额（数字）
	srcAmount, err := f.svc.CreateField(ctx, f.userID, f.projectID, f.tableID, FieldInput{Name: "金额", Type: "number"})
	if err != nil {
		t.Fatalf("创建字段失败：%v", err)
	}
	if _, err := f.svc.CreateField(ctx, f.userID, f.projectID, f.tableID, FieldInput{Name: "客户", Type: "text"}); err != nil {
		t.Fatalf("创建字段失败：%v", err)
	}

	// 目标表：同名同类型的字段 + 一个类型不同（应被跳过）的字段
	targetTable, err := f.svc.CreateTable(ctx, f.userID, f.projectID, f.baseID, "台账", "")
	if err != nil {
		t.Fatalf("创建目标表失败：%v", err)
	}
	if _, err := f.svc.CreateField(ctx, f.userID, f.projectID, targetTable.ID, FieldInput{Name: "金额", Type: "number"}); err != nil {
		t.Fatalf("创建目标字段失败：%v", err)
	}
	if _, err := f.svc.CreateField(ctx, f.userID, f.projectID, targetTable.ID, FieldInput{Name: "客户", Type: "text"}); err != nil {
		t.Fatalf("创建目标字段失败：%v", err)
	}
	if _, err := f.svc.CreateField(ctx, f.userID, f.projectID, targetTable.ID, FieldInput{Name: "客户", Type: "number"}); err != nil {
		t.Fatalf("创建目标字段失败：%v", err)
	}

	src, err := f.svc.CreateRecord(ctx, f.userID, f.projectID, f.tableID, RecordInput{
		Fields: map[string]any{srcAmount.ID: 128.5},
	})
	if err != nil {
		t.Fatalf("创建源记录失败：%v", err)
	}

	// 复制：源记录保留，目标表多一条。
	res, err := f.svc.TransferRecord(ctx, f.userID, f.projectID, f.tableID, TransferRecordInput{
		RecordID:      src.ID.String(),
		TargetTableID: targetTable.ID.String(),
		Mode:          TransferModeCopy,
	})
	if err != nil {
		t.Fatalf("跨表复制失败：%v", err)
	}
	if res.TargetRecordID == "" || len(res.CopiedFields) == 0 {
		t.Fatalf("复制结果异常：%+v", res)
	}
	if _, err := f.svc.GetRecord(ctx, f.userID, f.projectID, src.ID); err != nil {
		t.Fatalf("复制后源记录应仍存在：%v", err)
	}
	target, err := f.svc.GetRecord(ctx, f.userID, f.projectID, uuidMustParse(res.TargetRecordID))
	if err != nil {
		t.Fatalf("读取目标记录失败：%v", err)
	}
	found := false
	for _, value := range target.Fields {
		if number, ok := value.(float64); ok && number == 128.5 {
			found = true
		}
	}
	if !found {
		t.Fatalf("目标记录应带上金额 128.5，实际 %+v", target.Fields)
	}

	// 移动：源记录删除，目标表再多一条。
	res, err = f.svc.TransferRecord(ctx, f.userID, f.projectID, f.tableID, TransferRecordInput{
		RecordID:      src.ID.String(),
		TargetTableID: targetTable.ID.String(),
		Mode:          TransferModeMove,
	})
	if err != nil {
		t.Fatalf("跨表移动失败：%v", err)
	}
	if _, err := f.svc.GetRecord(ctx, f.userID, f.projectID, src.ID); err == nil {
		t.Fatalf("移动后源记录应被删除")
	}
	if res.TargetRecordID == "" {
		t.Fatalf("移动结果异常：%+v", res)
	}
}
