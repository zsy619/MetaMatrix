package base

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"metamatrix/api/internal/model"
)

// A-07：记录级授权支持「通讯录分组」。
//
// 部门只是 core_users 上的一个字符串字段（没有组织架构模型），
// 分组是 base_user_groups（真实分组模型），授权给组 = 组内成员全部可见。
func TestRecordGrantByUserGroup(t *testing.T) {
	f := newSummaryFixture(t)
	ctx := context.Background()

	// 两个空间成员：一个在组里，一个不在。
	memberID := uuid.New()
	outsideID := uuid.New()
	for _, uid := range []uuid.UUID{memberID, outsideID} {
		if err := f.db.Create(&model.KnowledgeMember{
			ID: uuid.New(), ProjectID: f.projectID, UserID: uid, Role: RoleViewer, CreatedBy: f.userID,
		}).Error; err != nil {
			t.Fatalf("insert member failed: %v", err)
		}
	}

	group := model.BaseUserGroup{
		ID:          uuid.New(),
		TenantID:    f.projectID,
		ProjectID:   f.projectID,
		Name:        "销售一部",
		Description: "测试分组",
		Members:     []byte(`["` + memberID.String() + `"]`),
		SortOrder:   0,
		Status:      1,
		CreatedBy:   f.userID,
	}
	if err := f.db.Create(&group).Error; err != nil {
		t.Fatalf("create group failed: %v", err)
	}

	// 一条「指定成员可见」的记录，授权给这个分组。
	visibility := RecordVisibilityCustom
	rec, err := f.svc.CreateRecord(ctx, f.userID, f.projectID, f.tableID, RecordInput{
		Visibility: &visibility,
		GrantSubjects: &[]GrantSubject{
			{Type: GrantSubjectGroup, ID: group.ID.String()},
		},
	})
	if err != nil {
		t.Fatalf("创建记录失败：%v", err)
	}

	// 组内成员必须能看到。
	res, err := f.svc.Query(ctx, memberID, f.projectID, QueryRequest{
		TableID: f.tableID.String(), PageSize: 50,
	})
	if err != nil {
		t.Fatalf("组内成员查询失败：%v", err)
	}
	found := false
	for _, row := range res.Records {
		if row.ID == rec.ID {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("组内成员应能看到受限记录（total=%d）", res.Total)
	}

	// 组外成员看不到。
	res, err = f.svc.Query(ctx, outsideID, f.projectID, QueryRequest{
		TableID: f.tableID.String(), PageSize: 50,
	})
	if err != nil {
		t.Fatalf("组外成员查询失败：%v", err)
	}
	for _, row := range res.Records {
		if row.ID == rec.ID {
			t.Fatalf("组外成员不应看到受限记录")
		}
	}
}

// 授权给**不存在**的分组必须报错：否则授权行会落库但永远命中不到人。
func TestRecordGrantByMissingGroupRejected(t *testing.T) {
	f := newSummaryFixture(t)
	ctx := context.Background()

	visibility := RecordVisibilityCustom
	_, err := f.svc.CreateRecord(ctx, f.userID, f.projectID, f.tableID, RecordInput{
		Visibility: &visibility,
		GrantSubjects: &[]GrantSubject{
			{Type: GrantSubjectGroup, ID: uuid.NewString()},
		},
	})
	if err == nil {
		t.Fatalf("授权给不存在的分组应报错")
	}
}
