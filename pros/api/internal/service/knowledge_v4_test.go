package service

import (
	"testing"

	"metamatrix/api/internal/model"
)

// 知识库 4.0：别名唯一性、提升式删除、分享口令闸门、敏感扫描。

func TestKnowledgeV4AliasUniqueAndPromoteDelete(t *testing.T) {
	db, owner, project, svc := openKnowledgeV3SQLite(t)
	parent, err := svc.Create(owner, project.ID, KnowledgeNodeInput{NodeType: "folder", Title: "父"})
	if err != nil {
		t.Fatal(err)
	}
	child, err := svc.Create(owner, project.ID, KnowledgeNodeInput{NodeType: "folder", Title: "子", ParentID: &parent.ID})
	if err != nil {
		t.Fatal(err)
	}
	alias := "唯一别名"
	if _, err := svc.UpdateNodeMeta(owner, project.ID, child.ID, NodeMetaInput{Alias: &alias}); err != nil {
		t.Fatal(err)
	}
	other, err := svc.Create(owner, project.ID, KnowledgeNodeInput{NodeType: "folder", Title: "另一个"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.UpdateNodeMeta(owner, project.ID, other.ID, NodeMetaInput{Alias: &alias}); err != ErrValidation {
		t.Fatalf("别名冲突应当报错，得到 %v", err)
	}
	// 提升式删除：子节点挂到父节点上，而不是被级联删掉。
	grand, err := svc.Create(owner, project.ID, KnowledgeNodeInput{NodeType: "folder", Title: "孙", ParentID: &child.ID})
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.DeleteWithPolicy(owner, project.ID, child.ID, true); err != nil {
		t.Fatal(err)
	}
	var moved model.KnowledgeNode
	if err := db.Where("id = ?", grand.ID).First(&moved).Error; err != nil {
		t.Fatal("孙节点应当被提升保留:", err)
	}
	if moved.ParentID == nil || *moved.ParentID != parent.ID {
		t.Fatalf("孙节点应当挂到父节点上，得到 %v", moved.ParentID)
	}
}

func TestKnowledgeV4SharePasswordGate(t *testing.T) {
	_, owner, project, svc := openKnowledgeV3SQLite(t)
	node, err := svc.CreateDocWithNode(owner, project.ID, nil, "带口令的文档", "")
	if err != nil {
		t.Fatal(err)
	}
	share, err := svc.CreateShareWith(owner, *node.DocumentID, CreateShareInput{
		Role:      "view",
		Password:  "s3cret",
		AllowCopy: false,
	})
	if err != nil {
		t.Fatal(err)
	}
	// 没口令只能拿到「需要口令」标记，拿不到正文。
	doc, err := svc.ResolveShare(share.Token)
	if err != nil {
		t.Fatal(err)
	}
	if !doc.RequiresPassword || doc.HTML != "" {
		t.Fatalf("无口令不应返回正文：%+v", doc)
	}
	if _, err := svc.ResolveShareWithPassword(share.Token, "wrong", nil); err != ErrValidation {
		t.Fatalf("口令错误应当报错，得到 %v", err)
	}
	doc, err = svc.ResolveShareWithPassword(share.Token, "s3cret", nil)
	if err != nil {
		t.Fatal(err)
	}
	if doc.AllowCopy {
		t.Fatal("禁止复制的分享应返回 allowCopy=false")
	}
}

func TestKnowledgeV4ScanSensitive(t *testing.T) {
	hits := ScanSensitive("联系 13800138000，密码: hunter2")
	if len(hits) != 2 {
		t.Fatalf("应当命中手机号与密码，得到 %+v", hits)
	}
	for _, hit := range hits {
		if hit.Match == "13800138000" {
			t.Fatal("命中结果应当打码")
		}
	}
}
