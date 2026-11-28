package base

import (
	"metamatrix/api/internal/model"
)

// Base Engine 的表结构定义在 internal/model（表结构唯一事实来源），
// 这里只做别名转发，业务代码继续用 base.BaseApp 这类短名字。

type BaseApp = model.BaseApp
type BaseTable = model.BaseTable
type BaseField = model.BaseField
type BaseFieldPolicy = model.BaseFieldPolicy
type BaseRecord = model.BaseRecord
type BaseRecordGrant = model.BaseRecordGrant
type BaseRecordValue = model.BaseRecordValue
type BaseView = model.BaseView
type BaseViewPref = model.BaseViewPref
type BaseRecordLink = model.BaseRecordLink
type BaseRecordReverseLink = model.BaseRecordReverseLink
type BaseFieldFormula = model.BaseFieldFormula
type BaseFormulaDependency = model.BaseFormulaDependency
type BaseOperationLog = model.BaseOperationLog
type BaseEventOutbox = model.BaseEventOutbox
type BaseImportJob = model.BaseImportJob

// BaseUserGroup 是通讯录分组模型。
type BaseUserGroup = model.BaseUserGroup
