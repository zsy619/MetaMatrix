package base

import (
	"metamatrix/api/internal/model"
)

// Base Engine 的表结构定义在 internal/model（表结构唯一事实来源），
// 这里只做别名转发，业务代码继续用 base.BaseApp 这类短名字。

type BaseApp = model.BaseApp
type BaseTable = model.BaseTable
type BaseField = model.BaseField
type BaseRecord = model.BaseRecord
type BaseRecordGrant = model.BaseRecordGrant
type BaseRecordValue = model.BaseRecordValue
type BaseView = model.BaseView
type BaseViewPref = model.BaseViewPref
type BaseRecordLink = model.BaseRecordLink
type BaseFieldFormula = model.BaseFieldFormula
type BaseFormulaDependency = model.BaseFormulaDependency
type BaseOperationLog = model.BaseOperationLog
type BaseEventOutbox = model.BaseEventOutbox
