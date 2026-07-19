"""
数据库配置
包含数据库连接、会话管理和依赖注入
"""

import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool, NullPool
from typing import Generator
from backend.models.base import Base

def _resolve_database_url() -> str:
    """Resolve DB URL with a safe test fallback."""
    env_database_url = os.getenv("DATABASE_URL")
    if env_database_url:
        return env_database_url

    # Keep tests isolated from local files and OneDrive/Temp permission issues.
    if "pytest" in sys.modules:
        return os.getenv("TEST_DATABASE_URL", "sqlite:///:memory:")

    try:
        from .config import get_database_url
        return get_database_url()
    except ImportError:
        return "sqlite:///autoclip.db"

# 数据库配置
DATABASE_URL = _resolve_database_url()

# 创建数据库引擎
if "sqlite" in DATABASE_URL:
    # SQLite配置
    sqlite_connect_args = {
        "check_same_thread": False,
        "timeout": 30
    }
    is_in_memory_sqlite = (
        DATABASE_URL in {"sqlite:///:memory:", "sqlite://"}
        or DATABASE_URL.endswith(":memory:")
    )
    engine = create_engine(
        DATABASE_URL,
        connect_args=sqlite_connect_args,
        # StaticPool is required for in-memory DB persistence across sessions.
        poolclass=StaticPool if is_in_memory_sqlite else NullPool,
        pool_pre_ping=True,
        echo=False  # 设置为True可以看到SQL语句
    )
else:
    # PostgreSQL配置
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=300,
        echo=False
    )

# 创建会话工厂
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

def get_db() -> Generator[Session, None, None]:
    """
    数据库会话依赖注入
    用于FastAPI的依赖注入系统
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def create_tables():
    """创建所有数据库表"""
    Base.metadata.create_all(bind=engine)

def drop_tables():
    """删除所有数据库表"""
    Base.metadata.drop_all(bind=engine)

def reset_database():
    """重置数据库"""
    drop_tables()
    create_tables()

from sqlalchemy import text

def test_connection() -> bool:
    """测试数据库连接"""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1")).fetchone()
        return True
    except Exception as e:
        print(f"数据库连接测试失败: {e}")
        return False

# 数据库初始化
def init_database():
    """初始化数据库"""
    print("正在初始化数据库...")
    
    # 测试连接
    if not test_connection():
        print("❌ 数据库连接失败")
        return False
    
    # 创建表
    try:
        create_tables()
        print("✅ 数据库表创建成功")
        return True
    except Exception as e:
        print(f"❌ 数据库表创建失败: {e}")
        return False

if __name__ == "__main__":
    # 直接运行此文件时初始化数据库
    init_database()
