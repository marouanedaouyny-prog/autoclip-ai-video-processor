"""Project configuration manager."""

import os
import logging
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Dict, Optional

import yaml

logger = logging.getLogger(__name__)


class ProcessingStep(str, Enum):
    STEP1_OUTLINE = "step1_outline"
    STEP2_TIMELINE = "step2_timeline"
    STEP3_SCORING = "step3_scoring"
    STEP4_TITLE = "step4_title"
    STEP5_CLUSTERING = "step5_clustering"
    STEP6_VIDEO = "step6_video"


@dataclass
class LLMConfig:
    api_key: str
    model_name: str = "qwen-plus"
    max_retries: int = 3
    timeout_seconds: int = 30


@dataclass
class ProcessingParams:
    chunk_size: int = 5000
    min_score_threshold: float = 0.7
    max_clips_per_collection: int = 5
    min_topic_duration_minutes: int = 2
    max_topic_duration_minutes: int = 12
    target_topic_duration_minutes: int = 5
    min_topics_per_chunk: int = 3
    max_topics_per_chunk: int = 8


class ProjectConfigManager:
    """Loads and persists per-project configuration."""

    def __init__(self, project_id: str):
        self.project_id = project_id
        self.project_dir = self._resolve_project_dir(project_id)
        self.config_path = self.project_dir / "config.yaml"
        self.prompt_dir = Path(__file__).parent.parent / "prompt"

        self.project_dir.mkdir(parents=True, exist_ok=True)
        self.config = self._load_config()

    def _resolve_project_dir(self, project_id: str) -> Path:
        candidate = Path(project_id)
        if candidate.is_absolute():
            return candidate

        if candidate.parent != Path("."):
            return candidate.resolve()

        return Path("data/projects") / project_id

    def _load_config(self) -> Dict[str, Any]:
        if not self.config_path.exists():
            return {}

        try:
            with open(self.config_path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
            return data if isinstance(data, dict) else {}
        except yaml.YAMLError as exc:
            logger.error("YAML parse error in %s: %s", self.config_path, exc)
            return {}
        except Exception as exc:
            logger.error("Failed to load config %s: %s", self.config_path, exc)
            return {}

    def _save_config(self):
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.config_path, "w", encoding="utf-8") as f:
            yaml.dump(self.config, f, default_flow_style=False, allow_unicode=True)

    def get_prompt_files(self, project_type: str = "default", language: str = "zh") -> Dict[str, Path]:
        prompt_config = self.config.get("prompts", {})

        base_prompts: Dict[str, Path] = {
            "outline": self.prompt_dir / "\u5927\u7eb2.txt",
            "timeline": self.prompt_dir / "\u65f6\u95f4\u70b9.txt",
            "recommendation": self.prompt_dir / "\u63a8\u8350\u7406\u7531.txt",
            "title": self.prompt_dir / "\u6807\u9898\u751f\u6210.txt",
            "clustering": self.prompt_dir / "\u4e3b\u9898\u805a\u7c7b.txt",
        }

        for key, custom_path in prompt_config.get("custom_paths", {}).items():
            if key in base_prompts:
                custom_file = Path(custom_path)
                if custom_file.exists():
                    base_prompts[key] = custom_file

        type_prompt_dir = self.prompt_dir / project_type
        if type_prompt_dir.exists():
            for key in list(base_prompts.keys()):
                type_specific = type_prompt_dir / f"{key}.txt"
                if type_specific.exists():
                    base_prompts[key] = type_specific

        if language != "zh":
            lang_prompt_dir = self.prompt_dir / "languages" / language
            if lang_prompt_dir.exists():
                for key in list(base_prompts.keys()):
                    lang_specific = lang_prompt_dir / f"{key}.txt"
                    if lang_specific.exists():
                        base_prompts[key] = lang_specific

        return base_prompts

    def get_llm_config(self) -> LLMConfig:
        llm_config = self.config.get("llm", {})
        api_key = llm_config.get("api_key") or os.getenv("DASHSCOPE_API_KEY", "")
        if not api_key:
            raise ValueError("DASHSCOPE_API_KEY not configured")

        return LLMConfig(
            api_key=api_key,
            model_name=llm_config.get("model_name", "qwen-plus"),
            max_retries=llm_config.get("max_retries", 3),
            timeout_seconds=llm_config.get("timeout_seconds", 30),
        )

    def get_processing_params(self) -> ProcessingParams:
        params = self.config.get("processing_params", {})
        return ProcessingParams(
            chunk_size=params.get("chunk_size", 5000),
            min_score_threshold=params.get("min_score_threshold", 0.7),
            max_clips_per_collection=params.get("max_clips_per_collection", 5),
            min_topic_duration_minutes=params.get("min_topic_duration_minutes", 2),
            max_topic_duration_minutes=params.get("max_topic_duration_minutes", 12),
            target_topic_duration_minutes=params.get("target_topic_duration_minutes", 5),
            min_topics_per_chunk=params.get("min_topics_per_chunk", 3),
            max_topics_per_chunk=params.get("max_topics_per_chunk", 8),
        )

    def update_processing_params(self, **kwargs):
        self.config.setdefault("processing_params", {}).update(kwargs)
        self._save_config()

    def update_llm_config(self, **kwargs):
        self.config.setdefault("llm", {}).update(kwargs)
        self._save_config()

    def get_project_paths(self) -> Dict[str, Path]:
        return {
            "project_dir": self.project_dir,
            "metadata_dir": self.project_dir / "metadata",
            "raw_dir": self.project_dir / "raw",
            "outputs_dir": self.project_dir / "outputs",
            "logs_dir": self.project_dir / "logs",
        }

    def ensure_project_directories(self):
        for path in self.get_project_paths().values():
            path.mkdir(parents=True, exist_ok=True)

    def get_step_config(self, step_name: str) -> Dict[str, Any]:
        return self.config.get("steps", {}).get(step_name, {})

    def update_step_config(self, step_name: str, **kwargs):
        self.config.setdefault("steps", {}).setdefault(step_name, {}).update(kwargs)
        self._save_config()

    def backup_config(self, backup_path: Optional[Path] = None) -> Path:
        if backup_path is None:
            stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_path = self.project_dir / f"config_backup_{stamp}.yaml"

        backup_path.parent.mkdir(parents=True, exist_ok=True)
        with open(backup_path, "w", encoding="utf-8") as f:
            yaml.dump(self.config, f, default_flow_style=False, allow_unicode=True)
        return backup_path

    def restore_config(self, backup_path: Path) -> bool:
        try:
            with open(backup_path, "r", encoding="utf-8") as f:
                backup_config = yaml.safe_load(f)
            if not isinstance(backup_config, dict):
                raise ValueError("Backup config is empty or invalid")

            self.backup_config()
            self.config = backup_config
            self._save_config()
            return True
        except Exception:
            logger.exception("Failed to restore config from %s", backup_path)
            return False

    def export_config(self) -> Dict[str, Any]:
        llm = self.get_llm_config()
        params = self.get_processing_params()
        return {
            "project_id": self.project_id,
            "llm_config": {
                "api_key": llm.api_key,
                "model_name": llm.model_name,
                "max_retries": llm.max_retries,
                "timeout_seconds": llm.timeout_seconds,
            },
            "processing_params": {
                "chunk_size": params.chunk_size,
                "min_score_threshold": params.min_score_threshold,
                "max_clips_per_collection": params.max_clips_per_collection,
                "min_topic_duration_minutes": params.min_topic_duration_minutes,
                "max_topic_duration_minutes": params.max_topic_duration_minutes,
                "target_topic_duration_minutes": params.target_topic_duration_minutes,
                "min_topics_per_chunk": params.min_topics_per_chunk,
                "max_topics_per_chunk": params.max_topics_per_chunk,
            },
            "project_paths": self.get_project_paths(),
            "prompt_files": self.get_prompt_files(),
        }

    def get_project_config(self) -> Dict[str, Any]:
        try:
            from ..core.database import SessionLocal
            from ..models.project import Project

            db = SessionLocal()
            try:
                project = db.query(Project).filter(Project.id == self.project_id).first()
                if project and project.processing_config:
                    return project.processing_config
            finally:
                db.close()
        except Exception:
            logger.exception("Failed to load project config from database")

        return self.config

    def validate_config(self) -> Dict[str, Any]:
        result = {
            "valid": True,
            "errors": [],
            "warnings": [],
            "missing_files": [],
        }

        try:
            self.get_llm_config()
        except ValueError as exc:
            result["valid"] = False
            result["errors"].append(f"LLM config error: {exc}")

        for key, path in self.get_prompt_files().items():
            if not path.exists():
                result["warnings"].append(f"Prompt missing: {key} -> {path}")
                result["missing_files"].append(str(path))

        for key, path in self.get_project_paths().items():
            if not path.exists():
                result["warnings"].append(f"Project path missing: {key} -> {path}")

        params = self.get_processing_params()
        if params.chunk_size <= 0:
            result["errors"].append("chunk_size must be greater than 0")
        if not 0 <= params.min_score_threshold <= 1:
            result["errors"].append("min_score_threshold must be between 0 and 1")

        if result["errors"]:
            result["valid"] = False

        return result
