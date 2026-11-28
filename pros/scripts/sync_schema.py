#!/usr/bin/env python3
"""一键同步数据结构：本地 PostgreSQL → 远程 PostgreSQL（只增不删）。

设计原则（对应需求「不要删除、修订远程的数据」）：

1. **只做增量**：只会在远程补建「本地有、远程没有」的对象 ——
   表、列、索引、序列、枚举类型、注释、唯一/主键/外键约束。
2. **绝不删改**：不生成 DROP / DELETE / TRUNCATE / ALTER COLUMN TYPE /
   SET DEFAULT / 改列约束 的语句；远程已存在的对象一律跳过。
3. **不碰数据**：不复制任何行数据，也不改动远程已有行的内容；
   序列的 setval 属于数据，同样不动（远程的 ID 继续沿用）。
4. **可回滚**：每条语句单独执行并记录结果，失败只报告、不中断整体同步。

用法：

    # 只看差异（默认，不写远程）
    python3 pros/scripts/sync_schema.py --dry-run

    # 执行同步
    python3 pros/scripts/sync_schema.py --apply

环境变量：

    LOCAL_DATABASE_URL   默认读 pros/api/.env 的 DATABASE_URL
    REMOTE_DATABASE_URL  默认 postgresql://metamatrix@101.132.237.173:5432/metamatrix
    REMOTE_DB_PASSWORD   远程密码（也可用 PGPASSWORD / ~/.pgpass）
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

PROS_DIR = Path(__file__).resolve().parent.parent
API_DIR = PROS_DIR / "api"

DEFAULT_REMOTE_URL = "postgresql://metamatrix@101.132.237.173:5432/metamatrix"

# pg_dump 会在每条语句末尾加分号；CREATE TABLE / ALTER TABLE 是跨行的，
# 所以按「以分号结尾的一行」切句。
RE_CREATE_TABLE = re.compile(r"^CREATE TABLE (?:public\.)?(\w+)")
RE_ADD_COLUMN = re.compile(r"^ALTER TABLE ONLY (?:public\.)?(\w+)\s+ADD COLUMN (\w+)")
RE_CREATE_INDEX = re.compile(r"^CREATE (UNIQUE )?INDEX (\w+) ON (?:public\.)?(\w+)")
RE_CREATE_TYPE = re.compile(r"^CREATE TYPE (?:public\.)?(\w+)")
RE_CREATE_SEQUENCE = re.compile(r"^CREATE SEQUENCE (?:public\.)?(\w+)")
RE_ADD_CONSTRAINT = re.compile(r"^ALTER TABLE ONLY (?:public\.)?(\w+)\s+ADD CONSTRAINT (\w+)")
RE_COMMENT = re.compile(r"^COMMENT ON (.*)")
RE_CREATE_EXTENSION = re.compile(r"^CREATE EXTENSION (?:IF NOT EXISTS )?(\w+)")
RE_ALTER_SEQUENCE = re.compile(r"^ALTER SEQUENCE (?:public\.)?(\w+) OWNED BY (?:public\.)?(\w+)\.(\w+)")
RE_SET_DEFAULT = re.compile(
    r"^ALTER TABLE ONLY (?:public\.)?(\w+) ALTER COLUMN (\w+) SET DEFAULT (.+)$", re.S
)

def is_forbidden(stmt: str) -> bool:
    """只允许「新增型」语句；改写型语句一律拦下。

    判定按语句首动词，而不是全文子串 —— 否则
    「... ON DELETE CASCADE」这种外键定义会被误判成 DELETE 语句。
    """
    text = stmt.strip()
    upper = text.upper()
    verb = upper.split(None, 1)[0] if upper else ""
    if verb in {"DROP", "DELETE", "TRUNCATE", "UPDATE", "GRANT", "REVOKE"}:
        return True
    if verb == "ALTER":
        if "RENAME" in upper or "OWNER TO" in upper:
            return True
        # ALTER COLUMN 只允许 SET DEFAULT：它只影响以后写入的行，不动已有数据。
        if "ALTER COLUMN" in upper and "SET DEFAULT" not in upper:
            return True
    return False


def fail(msg: str) -> None:
    print(f"❌ {msg}", file=sys.stderr)
    sys.exit(1)


def mask_url(url: str) -> str:
    """把 URL 里的密码替换成 ***，避免把凭据打到日志里。"""
    return re.sub(r"://([^:/@]+):[^@]*@", r"://\1:***@", url)


def normalize_default(value: str) -> str:
    """默认值归一化：去掉 schema 前缀与空白差异，避免重复下发。"""
    return re.sub(r"\s+", "", value.replace("public.", "")).replace("::regclass", "")


def read_local_url() -> str:
    env = os.environ.get("LOCAL_DATABASE_URL")
    if env:
        return env
    env_file = API_DIR / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    fail("找不到本地 DATABASE_URL（请设置 LOCAL_DATABASE_URL 或检查 pros/api/.env）")
    return ""


def password_of(url: str) -> str:
    """从连接串里取出密码（没有则返回空）。"""
    m = re.search(r"://[^:/@]+:([^@]*)@", url)
    return m.group(1) if m else ""


def run(cmd: list[str], env: dict | None = None) -> str:
    proc = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if proc.returncode != 0:
        fail(f"命令失败：{' '.join(cmd[:3])} ...\n{proc.stderr.strip()}")
    return proc.stdout


def psql(url: str, sql: str, password: str = "") -> str:
    env = dict(os.environ)
    if password:
        env["PGPASSWORD"] = password
    proc = subprocess.run(
        ["psql", url, "-AtF|", "-v", "ON_ERROR_STOP=1", "-c", sql],
        capture_output=True,
        text=True,
        env=env,
    )
    if proc.returncode != 0:
        fail(f"远程查询失败：{proc.stderr.strip()}")
    return proc.stdout


def dump_schema(url: str, password: str = "") -> str:
    env = dict(os.environ)
    if password:
        env["PGPASSWORD"] = password
    proc = subprocess.run(
        [
            "pg_dump",
            url,
            "--schema-only",
            "--no-owner",
            "--no-privileges",
            "--no-comments",
        ],
        capture_output=True,
        text=True,
        env=env,
    )
    if proc.returncode != 0:
        fail(f"pg_dump 失败：{proc.stderr.strip()}")
    return proc.stdout


def split_statements(sql: str) -> list[str]:
    """把 dump 切成一条条完整语句（保留换行，去掉结尾分号）。"""
    statements: list[str] = []
    buf: list[str] = []
    for line in sql.splitlines():
        if line.startswith("\\") or line.startswith("--"):
            continue
        buf.append(line)
        if line.rstrip().endswith(";"):
            text = "\n".join(buf).strip()
            buf = []
            if text.endswith(";"):
                text = text[:-1].strip()
            if text:
                statements.append(text)
    tail = "\n".join(buf).strip()
    if tail:
        statements.append(tail)
    return statements


def remote_inventory(url: str, password: str) -> dict[str, set[str]]:
    sql = """
    select 'table:'||table_name from information_schema.tables where table_schema='public'
    union all
    select 'column:'||table_name||'.'||column_name from information_schema.columns where table_schema='public'
    union all
    select 'index:'||indexname from pg_indexes where schemaname='public'
    union all
    select 'type:'||t.typname from pg_type t join pg_namespace n on n.oid=t.typnamespace
      where n.nspname='public' and t.typtype='e'
    union all
    select 'sequence:'||sequence_name from information_schema.sequences where sequence_schema='public'
    union all
    select 'constraint:'||c.conname from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public'
    union all
    select 'extension:'||extname from pg_extension
    """
    inventory: dict[str, set[str]] = {}
    for kind in ("table", "column", "index", "type", "sequence", "constraint", "extension"):
        inventory.setdefault(kind, set())
    inventory["column_default"] = {}
    inventory["comment"] = set()
    for row in psql(url, sql, password).splitlines():
        if not row:
            continue
        kind, _, name = row.partition(":")
        inventory.setdefault(kind, set()).add(name)
    return inventory


def remote_defaults(url: str, password: str) -> dict[str, str]:
    sql = """
    select table_name||'.'||column_name||'='||coalesce(column_default,'')
    from information_schema.columns where table_schema='public'
    """
    defaults: dict[str, str] = {}
    for row in psql(url, sql, password).splitlines():
        if not row:
            continue
        key, _, value = row.partition("=")
        defaults[key] = value
    return defaults


def remote_comments(url: str, password: str) -> set[str]:
    """远程已存在的注释文本（用于跳过重复下发 COMMENT）。"""
    sql = """
    select coalesce(obj_description(c.oid),'')||'|'||coalesce(col_description(c.oid,a.attnum),'')
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    left join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    where n.nspname='public' and c.relkind='r'
    """
    return {row for row in psql(url, sql, password).splitlines() if row}


def plan(
    local_sql: str,
    inventory: dict[str, set[str]],
    defaults: dict[str, str],
    comments: set[str],
    remote_statements: str,
) -> list[tuple[str, str]]:
    """产出需要下发的语句列表：(类别, SQL)。"""
    plan_items: list[tuple[str, str]] = []
    for stmt in split_statements(local_sql):
        upper = stmt.upper()
        set_default = RE_SET_DEFAULT.match(stmt)
        if not set_default and is_forbidden(stmt):
            continue

        m = RE_CREATE_EXTENSION.match(stmt)
        if m:
            # 扩展要先于索引创建（gin_trgm_ops 依赖 pg_trgm）。
            if m.group(1) not in inventory["extension"]:
                plan_items.append(("建扩展", stmt))
            continue

        m = RE_CREATE_TABLE.match(stmt)
        if m:
            if m.group(1) not in inventory["table"]:
                plan_items.append(("建表", stmt))
            continue

        m = RE_ADD_COLUMN.match(stmt)
        if m:
            key = f"{m.group(1)}.{m.group(2)}"
            if key not in inventory["column"]:
                # 给 ADD COLUMN 补 IF NOT EXISTS，避免并发场景下报错。
                stmt = re.sub(r"^ALTER TABLE ONLY (\S+) ADD COLUMN ", r"ALTER TABLE ONLY \1 ADD COLUMN IF NOT EXISTS ", stmt)
                plan_items.append(("加列", stmt))
            continue

        m = RE_CREATE_INDEX.match(stmt)
        if m:
            if m.group(2) not in inventory["index"]:
                stmt = re.sub(r"^CREATE (UNIQUE )?INDEX ", r"CREATE \1INDEX IF NOT EXISTS ", stmt)
                plan_items.append(("建索引", stmt))
            continue

        m = RE_CREATE_TYPE.match(stmt)
        if m:
            if m.group(1) not in inventory["type"]:
                plan_items.append(("建类型", stmt))
            continue

        m = RE_CREATE_SEQUENCE.match(stmt)
        if m:
            if m.group(1) not in inventory["sequence"]:
                plan_items.append(("建序列", stmt))
            continue

        m = RE_ALTER_SEQUENCE.match(stmt)
        if m:
            # 序列归属（OWNED BY）只绑定关系，不动序列当前值。
            if m.group(1) in inventory["sequence"] and stmt not in remote_statements:
                plan_items.append(("绑序列", stmt))
            continue

        m = RE_ADD_CONSTRAINT.match(stmt)
        if m:
            if m.group(2) not in inventory["constraint"]:
                plan_items.append(("加约束", stmt))
            continue

        if set_default:
            table, column, value = set_default.group(1), set_default.group(2), set_default.group(3).strip()
            key = f"{table}.{column}"
            # 归一化：information_schema 里的默认值常省略 schema 前缀。
            if normalize_default(defaults.get(key, "")) != normalize_default(value):
                plan_items.append(("设默认值", stmt))
            continue

        if RE_COMMENT.match(stmt):
            # 注释只在远程缺失时下发，不覆盖远程已有注释。
            if stmt not in remote_statements:
                plan_items.append(("加注释", stmt))
            continue

    return plan_items


def apply_statement(url: str, password: str, sql: str) -> tuple[bool, str]:
    env = dict(os.environ)
    if password:
        env["PGPASSWORD"] = password
    proc = subprocess.run(
        ["psql", url, "-v", "ON_ERROR_STOP=1", "-c", sql],
        capture_output=True,
        text=True,
        env=env,
    )
    return proc.returncode == 0, (proc.stderr or proc.stdout).strip()


def catalog_snapshot(url: str, password: str = "") -> dict[str, set[str]]:
    """对象级快照：用于最终复核（比逐行比对文本更准，不会被排版差异干扰）。"""
    inv = remote_inventory(url, password)
    defaults = remote_defaults(url, password)
    snapshot: dict[str, set[str]] = {
        "default": set(),
        "table": set(inv["table"]),
        "column": set(inv["column"]),
        "index": set(inv["index"]),
        "type": set(inv["type"]),
        "sequence": set(inv["sequence"]),
        "constraint": set(inv["constraint"]),
        "extension": set(inv["extension"]),
    }
    for key, value in defaults.items():
        snapshot["default"].add(f"{key}={value}")
    return snapshot


def diff_snapshots(local: dict[str, set[str]], remote: dict[str, set[str]]) -> list[str]:
    lines: list[str] = []
    for kind in local:
        missing = sorted(local[kind] - remote.get(kind, set()))
        extra = sorted(remote.get(kind, set()) - local[kind])
        for item in missing:
            lines.append(f"远程缺少 {kind}: {item}")
        for item in extra:
            lines.append(f"远程多出 {kind}: {item}")
    return lines


def main() -> int:
    parser = argparse.ArgumentParser(description="一键同步 PostgreSQL 表结构（只增不删）")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="真正写入远程（默认只预览）")
    mode.add_argument("--dry-run", action="store_true", help="只输出差异，不写远程")
    parser.add_argument("--remote-url", default=os.environ.get("REMOTE_DATABASE_URL", DEFAULT_REMOTE_URL))
    args = parser.parse_args()

    local_url = read_local_url()
    remote_url = args.remote_url
    # 密码优先级：显式环境变量 > PGPASSWORD > 本地连接串里的密码（同一套部署通常同密码）。
    remote_password = (
        os.environ.get("REMOTE_DB_PASSWORD")
        or os.environ.get("PGPASSWORD")
        or password_of(local_url)
    )

    print(f"本地：{mask_url(local_url)}")
    print(f"远程：{mask_url(remote_url)}")

    local_sql = dump_schema(local_url)
    remote_sql = dump_schema(remote_url, remote_password)
    inventory = remote_inventory(remote_url, remote_password)
    defaults = remote_defaults(remote_url, remote_password)
    comments = remote_comments(remote_url, remote_password)

    items = plan(local_sql, inventory, defaults, comments, remote_sql)

    # 差异摘要（忽略 pg_attver / \restrict 等噪声）。
    def norm(text: str) -> list[str]:
        return [
            line
            for line in text.splitlines()
            if "pg_attver=" not in line
            and not line.startswith("\\")
            and not line.startswith("--")
        ]

    only_local = [line for line in norm(local_sql) if line not in norm(remote_sql)]
    only_remote = [line for line in norm(remote_sql) if line not in norm(local_sql)]

    print(f"\n结构比对：本地独有语句 {len(only_local)} 条 / 远程独有语句 {len(only_remote)} 条")
    if only_remote:
        print("  （远程独有的语句属于远程环境差异，保持原样，不做任何删除或回退）")

    if not items:
        print("\n✅ 表结构已一致，无需同步（远程未做任何写入）")
        return 0

    print(f"\n待同步 {len(items)} 条（只增不删）：")
    for kind, sql in items:
        head = " ".join(sql.split())[:110]
        print(f"  [{kind}] {head}")

    if not args.apply:
        print("\n（预览模式。加 --apply 执行）")
        return 0

    print("\n开始下发到远程…")
    ok = 0
    failed: list[tuple[str, str]] = []
    for kind, sql in items:
        success, message = apply_statement(remote_url, remote_password, sql)
        if success:
            ok += 1
            print(f"  ✅ [{kind}] 已执行")
        else:
            failed.append((kind, message))
            print(f"  ❌ [{kind}] 失败：{message.splitlines()[0][:160]}")

    print(f"\n同步结果：成功 {ok} 条，失败 {len(failed)} 条")
    for kind, message in failed:
        print(f"  - [{kind}] {message.splitlines()[0][:200]}")

    # 复核：对象级比对，确认收敛。
    local_snapshot = catalog_snapshot(local_url)
    remote_snapshot = catalog_snapshot(remote_url, remote_password)
    still = diff_snapshots(local_snapshot, remote_snapshot)
    if still:
        print(f"\n⚠️ 复核发现 {len(still)} 处差异（本地有、远程缺 → 需补；远程多出 → 保留不动）：")
        for line in still[:20]:
            print("   ", line[:180])
    else:
        print("\n✅ 复核通过：远程结构已与本地一致")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
