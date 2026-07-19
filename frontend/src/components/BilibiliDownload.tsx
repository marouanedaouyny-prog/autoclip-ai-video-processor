import React, { useState, useEffect } from "react";
import {
  Button,
  message,
  Progress,
  Input,
  Card,
  Typography,
  Space,
  Spin,
  Select,
  Alert,
} from "antd";
import {
  DownloadOutlined,
  InfoCircleOutlined,
  LinkOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import {
  projectApi,
  bilibiliApi,
  VideoCategory,
  BilibiliDownloadTask,
  systemApi,
} from "../services/api";
import { useProjectStore } from "../store/useProjectStore";

const { Text } = Typography;

interface BilibiliDownloadProps {
  onDownloadSuccess?: (projectId: string) => void;
}

// 使用从API导入的BilibiliDownloadTask类型

const BilibiliDownload: React.FC<BilibiliDownloadProps> = ({
  onDownloadSuccess,
}) => {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [projectName, setProjectName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedBrowser, setSelectedBrowser] = useState<string>("");
  const [isDocker, setIsDocker] = useState<boolean>(false);
  const [categories, setCategories] = useState<VideoCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [currentTask, setCurrentTask] = useState<BilibiliDownloadTask | null>(
    null,
  );
  const [pollingInterval, setPollingInterval] = useState<number | null>(null);
  const [videoInfo, setVideoInfo] = useState<any>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");

  const { addProject } = useProjectStore();

  // 加载视频分类配置和系统环境
  useEffect(() => {
    const loadInitialData = async () => {
      setLoadingCategories(true);
      try {
        // 加载分类
        const categoryResponse = await projectApi.getVideoCategories();
        setCategories(categoryResponse.categories);
        if (categoryResponse.default_category) {
          setSelectedCategory(categoryResponse.default_category);
        } else if (categoryResponse.categories.length > 0) {
          setSelectedCategory(categoryResponse.categories[0].value);
        }

        // 加载环境信息
        try {
          const envResponse = await systemApi.getSystemEnv();
          setIsDocker(envResponse.is_docker);
        } catch (envError) {
          console.error("Failed to load system env:", envError);
        }
      } catch (error) {
        console.error("Failed to load initial data:", error);
        message.error("加载初始化数据失败");
      } finally {
        setLoadingCategories(false);
      }
    };

    loadInitialData();
  }, []);

  // 清理轮询
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  const validateVideoUrl = (url: string): boolean => {
    const bilibiliPatterns = [
      /^https?:\/\/www\.bilibili\.com\/video\/[Bb][Vv][0-9A-Za-z]+/,
      /^https?:\/\/bilibili\.com\/video\/[Bb][Vv][0-9A-Za-z]+/,
      /^https?:\/\/b23\.tv\/[0-9A-Za-z]+/,
      /^https?:\/\/www\.bilibili\.com\/video\/av\d+/,
      /^https?:\/\/bilibili\.com\/video\/av\d+/,
    ];

    const youtubePatterns = [
      /youtube\.com\/watch\?v=[a-zA-Z0-9_-]+/,
      /youtu\.be\/[a-zA-Z0-9_-]+/,
      /youtube\.com\/embed\/[a-zA-Z0-9_-]+/,
      /youtube\.com\/v\/[a-zA-Z0-9_-]+/,
      /youtube\.com\/shorts\/[a-zA-Z0-9_-]+/,
    ];

    return (
      bilibiliPatterns.some((pattern) => pattern.test(url.toLowerCase())) ||
      youtubePatterns.some((pattern) => pattern.test(url.toLowerCase()))
    );
  };

  const getVideoType = (url: string): "bilibili" | "youtube" | null => {
    const bilibiliPatterns = [
      /^https?:\/\/www\.bilibili\.com\/video\/[Bb][Vv][0-9A-Za-z]+/,
      /^https?:\/\/bilibili\.com\/video\/[Bb][Vv][0-9A-Za-z]+/,
      /^https?:\/\/b23\.tv\/[0-9A-Za-z]+/,
      /^https?:\/\/www\.bilibili\.com\/video\/av\d+/,
      /^https?:\/\/bilibili\.com\/video\/av\d+/,
    ];

    const youtubePatterns = [
      /youtube\.com\/watch\?v=[a-zA-Z0-9_-]+/,
      /youtu\.be\/[a-zA-Z0-9_-]+/,
      /youtube\.com\/embed\/[a-zA-Z0-9_-]+/,
      /youtube\.com\/v\/[a-zA-Z0-9_-]+/,
      /youtube\.com\/shorts\/[a-zA-Z0-9_-]+/,
    ];

    if (bilibiliPatterns.some((pattern) => pattern.test(url.toLowerCase()))) {
      return "bilibili";
    } else if (youtubePatterns.some((pattern) => pattern.test(url.toLowerCase()))) {
      return "youtube";
    }
    return null;
  };

  const parseVideoInfo = async () => {
    if (!url.trim()) {
      setError(t("import.error_empty", "Please enter a valid video link"));
      return;
    }

    const videoType = getVideoType(url.trim());
    if (!videoType) {
      setError(
        t(
          "import.error_invalid",
          "Please enter a valid Bilibili or YouTube video link",
        ),
      );
      return;
    }

    setParsing(true);
    setError(""); // 清除之前的错误信息

    try {
      let response;
      if (videoType === "bilibili") {
        response = await bilibiliApi.parseVideoInfo(
          url.trim(),
          selectedBrowser,
        );
      } else if (videoType === "youtube") {
        response = await bilibiliApi.parseYouTubeVideoInfo(
          url.trim(),
          selectedBrowser,
        );
      }

      const parsedVideoInfo = response.video_info;

      setVideoInfo(parsedVideoInfo);
      setError(""); // 解析成功，清除错误信息

      // 自动填充项目名称
      if (!projectName && parsedVideoInfo.title) {
        setProjectName(parsedVideoInfo.title);
      }

      return parsedVideoInfo;
    } catch (error: any) {
      setError(t('bilibili.invalid_url', 'Please enter a valid YouTube or Bilibili video link'));
      setVideoInfo(null);
    } finally {
      setParsing(false);
    }
  };

  const startPolling = (taskId: string, videoType: "bilibili" | "youtube") => {
    const interval = setInterval(async () => {
      try {
        let task;
        if (videoType === "bilibili") {
          task = await bilibiliApi.getTaskStatus(taskId);
        } else {
          task = await bilibiliApi.getYouTubeTaskStatus(taskId);
        }
        setCurrentTask(task);

        if (task.status === "completed") {
          clearInterval(interval);
          setPollingInterval(null);
          setDownloading(false);
          message.success("视频下载完成！");

          if (task.project_id && onDownloadSuccess) {
            onDownloadSuccess(task.project_id);
          }

          // 重置状态
          resetForm();
        } else if (task.status === "failed") {
          clearInterval(interval);
          setPollingInterval(null);
          setDownloading(false);
          message.error(`下载失败: ${task.error_message || "未知错误"}`);
          resetForm();
        }
      } catch (error) {
        console.error("轮询任务状态失败:", error);
      }
    }, 2000);

    setPollingInterval(interval);
  };

  const handleDownload = async () => {
    if (!url.trim()) {
      message.error("请输入视频链接");
      return;
    }

    const videoType = getVideoType(url.trim());
    if (!videoType) {
      message.error("请输入有效的B站或YouTube视频链接");
      return;
    }

    setDownloading(true);

    try {
      const requestBody: any = {
        url: url.trim(),
        video_category: selectedCategory,
      };

      if (projectName.trim()) {
        requestBody.project_name = projectName.trim();
      }

      if (selectedBrowser) {
        requestBody.browser = selectedBrowser;
      }

      let response;
      if (videoType === "bilibili") {
        response = await bilibiliApi.createDownloadTask(requestBody);
      } else {
        response = await bilibiliApi.createYouTubeDownloadTask(requestBody);
      }

      // 检查响应是否包含项目ID（新的优化后的响应格式）
      if (response.project_id) {
        // 新格式：项目已创建，立即重置表单
        setCurrentTask(null);
        setDownloading(false);
        resetForm();

        // 显示统一的成功提示
        const platformName = videoType === "bilibili" ? "B站" : "YouTube";
        message.success(
          `${platformName}项目创建成功，正在后台下载中，您可以继续添加其他项目`,
        );

        if (onDownloadSuccess) {
          onDownloadSuccess(response.project_id);
        }
      } else {
        // 旧格式：继续轮询任务状态
        setCurrentTask(response);
        startPolling(response.id, videoType);
      }
    } catch (error: any) {
      setDownloading(false);
      const errorMessage =
        error.response?.data?.detail || error.message || "创建下载任务失败";
      message.error(errorMessage);
    }
  };

  const resetForm = () => {
    setUrl("");
    setProjectName("");
    setCurrentTask(null);
    setVideoInfo(null);
    setError("");
    // 保持分类和浏览器选择，方便用户继续添加项目
    // setSelectedCategory(categories[0].value)
    // setSelectedBrowser('')
  };

  const stopDownload = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
    setDownloading(false);
    setCurrentTask(null);
    message.info("已停止监控下载任务");
  };

  return (
    <div
      style={{
        width: "100%",
        margin: "0 auto",
      }}
    >
      {/* 输入表单 */}
      <div style={{ marginBottom: "16px" }}>
        <Space direction="vertical" style={{ width: "100%" }} size={16}>
          <div>
            <div
              style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}
            >
              <Input.TextArea
                placeholder={t(
                  "import.url_placeholder",
                  "Paste Bilibili or YouTube video link here...\nExample: https://www.youtube.com/watch?v=xxxxx",
                )}
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (videoInfo) {
                    setVideoInfo(null);
                    setProjectName("");
                  }
                  if (error) setError("");
                }}
                style={{
                  flex: 1,
                  background: "rgba(38, 38, 38, 0.8)",
                  border: "1px solid rgba(99, 102, 241, 0.3)",
                  borderRadius: "12px",
                  color: "#ffffff",
                  fontSize: "14px",
                  resize: "none",
                }}
                rows={2}
                disabled={downloading || parsing}
              />
              <Button
                type="primary"
                icon={<LinkOutlined />}
                loading={parsing}
                onClick={parseVideoInfo}
                disabled={!url.trim() || downloading}
                style={{
                  height: "52px",
                  borderRadius: "12px",
                  background:
                    "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                  border: "none",
                  boxShadow: "0 4px 15px rgba(99, 102, 241, 0.3)",
                  fontWeight: 600,
                }}
              >
                {t("import.fetch_link", "Fetch Video Link")}
              </Button>
            </div>
            {parsing && (
              <div
                style={{
                  marginTop: "8px",
                  color: "#4facfe",
                  fontSize: "14px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span>{t('bilibili.parsing_video', 'Fetching video info...')}</span>
              </div>
            )}
            {error && !parsing && (
              <div
                style={{
                  marginTop: "8px",
                  color: "#ff6b6b",
                  fontSize: "14px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* 显示解析成功的视频信息 */}
          {videoInfo && (
            <div
              style={{
                background: "rgba(102, 126, 234, 0.1)",
                border: "1px solid rgba(102, 126, 234, 0.3)",
                borderRadius: "8px",
                padding: "12px",
                marginBottom: "12px",
              }}
            >
              <Text
                style={{
                  color: "#667eea",
                  fontWeight: 600,
                  fontSize: "16px",
                  display: "block",
                  marginBottom: "8px",
                }}
              >
                视频信息解析成功
              </Text>
              <Text
                style={{ color: "#ffffff", fontSize: "14px", display: "block" }}
              >
                {videoInfo.title}
              </Text>
              <Text
                style={{ color: "rgba(255, 255, 255, 0.6)", fontSize: "12px" }}
              >
                {getVideoType(url) === "bilibili" ? "UP主" : "频道"}:{" "}
                {videoInfo.uploader || "未知"} • 时长:{" "}
                {videoInfo.duration
                  ? `${Math.floor(videoInfo.duration / 60)}:${String(Math.floor(videoInfo.duration % 60)).padStart(2, "0")}`
                  : "未知"}
              </Text>
            </div>
          )}

          {/* 只有解析成功后才显示项目名称和分类 */}
          {videoInfo && (
            <>
              <div>
                <Text
                  style={{
                    color: "#ffffff",
                    marginBottom: "12px",
                    display: "block",
                    fontSize: "16px",
                    fontWeight: 500,
                  }}
                >
                  {t("import.project_name", "Project Name (Optional)")}
                </Text>
                <Input
                  placeholder={t(
                    "import.project_name_placeholder",
                    "Leave blank to use video title",
                  )}
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  style={{
                    background: "rgba(38, 38, 38, 0.8)",
                    border: "1px solid rgba(79, 172, 254, 0.3)",
                    borderRadius: "12px",
                    color: "#ffffff",
                    height: "48px",
                    fontSize: "14px",
                  }}
                  disabled={downloading}
                />
              </div>

              <div>
                <Text
                  style={{
                    color: "#ffffff",
                    marginBottom: "12px",
                    display: "block",
                    fontSize: "16px",
                    fontWeight: 500,
                  }}
                >
                  浏览器选择（获取AI字幕需要）
                </Text>

                {isDocker && selectedBrowser && (
                  <Alert
                    message="Docker 环境限制"
                    description="检测到您正在 Docker 中使用 AutoClip。Docker 无法访问您宿主机（Windows/Mac）上的浏览器 Cookie。请在下方选择空，或在解析失败时不要选择任何浏览器。"
                    type="info"
                    showIcon
                    icon={<InfoCircleOutlined />}
                    style={{
                      marginBottom: "12px",
                      background: "rgba(79, 172, 254, 0.1)",
                      border: "1px solid rgba(79, 172, 254, 0.3)",
                      color: "#ffffff",
                    }}
                  />
                )}

                <Select
                  placeholder="选择浏览器以获取cookie（可选）"
                  value={selectedBrowser || undefined}
                  onChange={(value) => setSelectedBrowser(value || "")}
                  allowClear
                  style={{
                    width: "100%",
                    height: "48px",
                  }}
                  dropdownStyle={{
                    background: "rgba(38, 38, 38, 0.95)",
                    border: "1px solid rgba(79, 172, 254, 0.3)",
                    borderRadius: "12px",
                  }}
                  disabled={downloading}
                >
                  <Select.Option value="chrome">Chrome</Select.Option>
                  <Select.Option value="firefox">Firefox</Select.Option>
                  <Select.Option value="safari">Safari</Select.Option>
                  <Select.Option value="edge">Edge</Select.Option>
                </Select>
                <Text
                  style={{
                    color: "rgba(255, 255, 255, 0.6)",
                    fontSize: "12px",
                    marginTop: "8px",
                    display: "block",
                  }}
                >
                  选择浏览器可获取登录状态，用于下载AI字幕。如不选择将只能下载公开字幕。
                </Text>
              </div>

              <div>
                <Text
                  style={{
                    color: "#ffffff",
                    marginBottom: "12px",
                    display: "block",
                    fontSize: "16px",
                    fontWeight: 500,
                  }}
                >
                  {t("import.video_category", "Video Category")}
                </Text>
                {loadingCategories ? (
                  <Spin size="small" />
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "8px",
                    }}
                  >
                    {categories.map((category) => {
                      const isSelected = selectedCategory === category.value;
                      return (
                        <div
                          key={category.value}
                          onClick={() => setSelectedCategory(category.value)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "8px 12px",
                            borderRadius: "6px",
                            border: isSelected
                              ? `2px solid ${category.color}`
                              : "2px solid rgba(255, 255, 255, 0.1)",
                            background: isSelected
                              ? `${category.color}25`
                              : "rgba(255, 255, 255, 0.05)",
                            color: isSelected
                              ? "#ffffff"
                              : "rgba(255, 255, 255, 0.8)",
                            boxShadow: isSelected
                              ? `0 0 12px ${category.color}40`
                              : "none",
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                            fontSize: "13px",
                            fontWeight: isSelected ? 600 : 400,
                            userSelect: "none",
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.background =
                                "rgba(255, 255, 255, 0.1)";
                              e.currentTarget.style.borderColor =
                                "rgba(255, 255, 255, 0.2)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.background =
                                "rgba(255, 255, 255, 0.05)";
                              e.currentTarget.style.borderColor =
                                "rgba(255, 255, 255, 0.1)";
                            }
                          }}
                        >
                          <span style={{ fontSize: "14px" }}>
                            {category.icon}
                          </span>
                          <span>{category.name}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </Space>
      </div>

      {/* 操作按钮 - 只有解析成功后才显示 */}
      {videoInfo && (
        <div
          style={{
            marginBottom: "16px",
            display: "flex",
            justifyContent: "center",
            gap: "12px",
          }}
        >
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleDownload}
            loading={downloading}
            disabled={!url.trim()}
            size="large"
            style={{
              background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
              border: "none",
              borderRadius: "12px",
              height: "48px",
              padding: "0 32px",
              fontSize: "16px",
              fontWeight: 600,
              boxShadow: "0 4px 20px rgba(99, 102, 241, 0.3)",
              minWidth: "160px",
            }}
          >
            {downloading
              ? t("import.importing", "Importing...")
              : t("import.start_import", "Start Import")}
          </Button>

          {downloading && (
            <Button
              onClick={stopDownload}
              size="large"
              style={{
                background: "rgba(255, 255, 255, 0.1)",
                border: "1px solid rgba(255, 255, 255, 0.3)",
                color: "#ffffff",
                borderRadius: "12px",
                height: "48px",
                padding: "0 24px",
                fontSize: "14px",
              }}
            >
              停止监控
            </Button>
          )}
        </div>
      )}

      {/* 下载进度 */}
      {currentTask && (
        <Card
          style={{
            background: "rgba(38, 38, 38, 0.8)",
            border: "1px solid rgba(79, 172, 254, 0.3)",
            borderRadius: "12px",
            marginTop: "16px",
            backdropFilter: "blur(10px)",
          }}
          styles={{
            body: { padding: "16px" },
          }}
        >
          <div style={{ marginBottom: "16px" }}>
            <Text
              style={{ color: "#ffffff", fontWeight: 600, fontSize: "18px" }}
            >
              导入进度
            </Text>
          </div>

          {currentTask.video_info && (
            <div style={{ marginBottom: "16px" }}>
              <Text
                style={{ color: "#4facfe", fontWeight: 600, fontSize: "16px" }}
              >
                {currentTask.video_info.title}
              </Text>
            </div>
          )}

          <div style={{ marginBottom: "16px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "8px",
              }}
            >
              <Text style={{ color: "#cccccc", fontSize: "14px" }}>
                状态: {currentTask.status}
              </Text>
              <Text style={{ color: "#cccccc", fontSize: "14px" }}>
                {Math.round(currentTask.progress)}%
              </Text>
            </div>

            <Progress
              percent={Math.round(currentTask.progress)}
              status={currentTask.status === "failed" ? "exception" : "active"}
              strokeColor={{
                "0%": "#4facfe",
                "100%": "#00f2fe",
              }}
              trailColor="rgba(255, 255, 255, 0.1)"
              strokeWidth={8}
              showInfo={false}
            />
          </div>

          {currentTask.error_message && (
            <div
              style={{
                marginTop: "16px",
                padding: "12px",
                background: "rgba(255, 77, 79, 0.1)",
                border: "1px solid rgba(255, 77, 79, 0.3)",
                borderRadius: "8px",
              }}
            >
              <Text style={{ color: "#ff4d4f", fontSize: "14px" }}>
                错误: {currentTask.error_message}
              </Text>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

export default BilibiliDownload;
