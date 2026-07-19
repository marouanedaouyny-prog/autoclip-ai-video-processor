import React, { useState, useEffect } from 'react'
import { Button, message, Progress, Space, Typography, Card, Input, Spin } from 'antd'
import { InboxOutlined, VideoCameraOutlined, FileTextOutlined, SubnodeOutlined } from '@ant-design/icons'
import { useDropzone } from 'react-dropzone'
import { useTranslation } from 'react-i18next'
import { projectApi, VideoCategory, VideoCategoriesResponse } from '../services/api'
import { useProjectStore } from '../store/useProjectStore'

const { Text, Title } = Typography

interface FileUploadProps {
  onUploadSuccess?: (projectId: string) => void
}

const FileUpload: React.FC<FileUploadProps> = ({ onUploadSuccess }) => {
  const { t } = useTranslation()
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [projectName, setProjectName] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [categories, setCategories] = useState<VideoCategory[]>([])
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [files, setFiles] = useState<{
    video?: File
    srt?: File
  }>({})
  
  const { addProject } = useProjectStore()

  // 加载视频分类配置
  useEffect(() => {
    const loadCategories = async () => {
      setLoadingCategories(true)
      try {
        const response = await projectApi.getVideoCategories()
        setCategories(response.categories)
        // 设置默认选中【默认】选项
        if (response.default_category) {
          setSelectedCategory(response.default_category)
        } else if (response.categories.length > 0) {
          setSelectedCategory(response.categories[0].value)
        }
      } catch (error) {
        console.error('Failed to load video categories:', error)
        message.error(t('import.error_loading_categories', 'Failed to load video categories'))
      } finally {
        setLoadingCategories(false)
      }
    }

    loadCategories()
  }, [])

  const onDrop = (acceptedFiles: File[]) => {
    const newFiles = { ...files }
    
    acceptedFiles.forEach(file => {
      const extension = file.name.split('.').pop()?.toLowerCase()
      
      if (['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(extension || '')) {
        newFiles.video = file
        // 自动设置项目名称为视频文件名（去掉扩展名）
        // 每次选择新视频文件时都更新项目名称
        setProjectName(file.name.replace(/\.[^/.]+$/, ''))
      } else if (extension === 'srt') {
        newFiles.srt = file
      }
    })
    
    setFiles(newFiles)
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.avi', '.mov', '.mkv', '.webm'],
      'application/x-subrip': ['.srt']
    },
    multiple: true
  })

  const handleUpload = async () => {
    if (!files.video) {
      message.error(t('import.error_no_video', 'Please select a video file'))
      return
    }

    if (!projectName.trim()) {
      message.error(t('import.error_no_project_name', 'Please enter a project name'))
      return
    }

    setUploading(true)
    setUploadProgress(0)
    
    try {
      // 模拟上传进度，更真实的进度显示
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 85) {
            clearInterval(progressInterval)
            return prev
          }
          // 使用递减的增量，模拟真实上传进度
          const increment = Math.max(1, Math.floor((90 - prev) / 10))
          return prev + increment
        })
      }, 300)

      console.log('开始上传文件:', {
        video_file: files.video.name,
        srt_file: files.srt?.name || '(将使用语音识别生成)',
        project_name: projectName.trim(),
        video_category: selectedCategory
      })

      const newProject = await projectApi.uploadFiles({
        video_file: files.video,
        srt_file: files.srt,
        project_name: projectName.trim(),
        video_category: selectedCategory
      })
      
      console.log('上传成功，项目信息:', newProject)
      
      clearInterval(progressInterval)
      setUploadProgress(100)
      
      addProject(newProject)
      message.success(t('import.upload_success', 'Project created successfully! Processing in background...'))
      
      // 重置状态
      setFiles({})
      setProjectName('')
      setUploadProgress(0)
      setUploading(false)
      // 重置为默认分类
      if (categories.length > 0) {
        setSelectedCategory(categories[0].value)
      }
      
      if (onUploadSuccess) {
        onUploadSuccess(newProject.id)
      }
      
    } catch (error: any) {
      console.error('上传失败，详细错误:', error)
      
      let errorMessage = t('import.error_upload', 'Upload failed, please try again')
      let errorType = 'error'
      
      if (error.response?.status === 413) {
        errorMessage = t('import.error_too_large', 'File is too large, please select a smaller video')
        errorType = 'warning'
      } else if (error.response?.status === 415) {
        errorMessage = t('import.error_format', 'Unsupported format. Please choose MP4, AVI, MOV, MKV, or WEBM')
        errorType = 'warning'
      } else if (error.response?.status === 400) {
        if (error.response?.data?.detail) {
          errorMessage = error.response.data.detail
        } else {
          errorMessage = t('import.error_bad_request', 'File format or content issue, please check and try again')
        }
      } else if (error.response?.status === 500) {
        errorMessage = t('import.error_server', 'Server error while processing file, please try again later')
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = '上传超时，请检查网络连接后重试'
      } else if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail
      } else if (error.userMessage) {
        errorMessage = error.userMessage
      } else if (error.message) {
        errorMessage = error.message
      }
      
      // 显示错误信息
      if (errorType === 'warning') {
        message.warning(errorMessage)
      } else {
        message.error(errorMessage)
      }
      
      // 如果是网络错误，提供重试建议
      if (error.code === 'ECONNABORTED' || error.response?.status >= 500) {
        message.info('如果问题持续存在，请检查网络连接或联系技术支持', 5)
      }
    } finally {
      setUploading(false)
    }
  }

  const removeFile = (type: 'video' | 'srt') => {
    setFiles(prev => {
      const newFiles = { ...prev }
      delete newFiles[type]
      return newFiles
    })
  }

  return (
    <div style={{
      borderRadius: '16px',
      padding: '0',
      transition: 'all 0.3s ease',
      position: 'relative',
      overflow: 'hidden',
      width: '100%',
      margin: '0 auto'
    }}>
      {/* 背景装饰 */}
      <div style={{
        position: 'absolute',
        top: '-50%',
        right: '-50%',
        width: '200%',
        height: '200%',
        background: 'radial-gradient(circle, rgba(79, 172, 254, 0.08) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />
      

      
      <div 
        {...getRootProps()} 
        className={`upload-area ${isDragActive ? 'dragover' : ''}`}
        style={{
          padding: '24px 16px',
          textAlign: 'center',
          marginBottom: '16px',
          background: isDragActive ? 'rgba(79, 172, 254, 0.15)' : 'rgba(38, 38, 38, 0.6)',
          border: `2px dashed ${isDragActive ? '#4facfe' : 'rgba(79, 172, 254, 0.3)'}`,
          borderRadius: '16px',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          position: 'relative',
          backdropFilter: 'blur(10px)'
        }}
      >
        <input {...getInputProps()} />
        <div style={{
          width: '48px',
          height: '48px',
          margin: '0 auto 12px',
          background: isDragActive ? 'rgba(79, 172, 254, 0.3)' : 'rgba(79, 172, 254, 0.1)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.3s ease',
          border: '1px solid rgba(79, 172, 254, 0.2)'
        }}>
          <InboxOutlined style={{ 
            fontSize: '20px', 
            color: isDragActive ? '#6366f1' : '#6366f1'
          }} />
        </div>
        <div>
          <Text strong style={{ 
            color: '#ffffff',
            fontSize: '16px',
            display: 'block',
            marginBottom: '8px',
            fontWeight: 600
          }}>
            {isDragActive ? t('import.drop_to_import', 'Drop files to import') : t('import.click_or_drag', 'Click or drag files to this area')}
          </Text>
          <Text style={{ color: '#cccccc', fontSize: '14px', lineHeight: '1.5' }}>
            {t('import.supported_formats', 'Supports MP4, AVI, MOV, MKV, WebM.')} <Text style={{ color: '#6366f1', fontWeight: 600 }}>{t('import.optional_srt', 'Optional: import .srt subtitles or use AI generation.')}</Text>
          </Text>
        </div>
      </div>

      {/* 项目名称输入 - 只有在选择文件后才显示 */}
      {files.video && (
        <div style={{ marginBottom: '16px' }}>
          <Text strong style={{ color: '#ffffff', fontSize: '14px', marginBottom: '8px', display: 'block' }}>
            {t('import.project_name', 'Project Name')}
          </Text>
          <Input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder={t('import.project_name_placeholder', 'Enter project name to identify your video')}
            style={{ 
              height: '40px',
              borderRadius: '12px',
              fontSize: '14px',
              background: 'rgba(38, 38, 38, 0.8)',
              border: '1px solid rgba(79, 172, 254, 0.3)',
              color: '#ffffff'
            }}
          />
        </div>
      )}

      {/* 视频分类选择 - 只有在选择文件后才显示 */}
      {files.video && (
        <div style={{ marginBottom: '16px' }}>
          <Text strong style={{ color: '#ffffff', fontSize: '14px', marginBottom: '8px', display: 'block' }}>
            {t('import.video_category', 'Video Category')}
          </Text>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            {categories.map(category => {
              const isSelected = selectedCategory === category.value
              return (
                <div
                  key={category.value}
                  onClick={() => setSelectedCategory(category.value)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: isSelected 
                      ? `2px solid ${category.color}` 
                      : '2px solid rgba(255, 255, 255, 0.1)',
                    background: isSelected 
                      ? `${category.color}25` 
                      : 'rgba(255, 255, 255, 0.05)',
                    color: isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.8)',
                    boxShadow: isSelected 
                      ? `0 0 12px ${category.color}40` 
                      : 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    fontSize: '13px',
                    fontWeight: isSelected ? 600 : 400,
                    userSelect: 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                    }
                  }}
                >
                  <span style={{ fontSize: '14px' }}>{category.icon}</span>
                  <span>{category.name}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 文件列表 */}
      {Object.keys(files).length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <Text strong style={{ color: '#ffffff', fontSize: '14px', marginBottom: '12px', display: 'block' }}>
            {t('import.selected_files', 'Selected Files')}
          </Text>
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            {files.video && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                padding: '16px',
                background: 'rgba(38, 38, 38, 0.8)',
                borderRadius: '12px',
                border: '1px solid rgba(79, 172, 254, 0.2)',
                backdropFilter: 'blur(10px)'
              }}>
                <Space size="middle">
                  <div style={{
                    width: '36px',
                    height: '36px',
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
                  }}>
                    <VideoCameraOutlined style={{ color: '#ffffff', fontSize: '16px' }} />
                  </div>
                  <div>
                    <Text style={{ color: '#ffffff', fontWeight: 600, display: 'block', fontSize: '14px' }}>
                      {files.video.name}
                    </Text>
                    <Text style={{ color: '#cccccc', fontSize: '13px' }}>
                      {(files.video.size / 1024 / 1024).toFixed(2)} MB
                    </Text>
                  </div>
                </Space>
                <Button 
                  size="small" 
                  type="text" 
                  onClick={() => removeFile('video')}
                  style={{ 
                    color: '#ff6b6b',
                    borderRadius: '8px',
                    padding: '4px 12px',
                    fontSize: '12px'
                  }}
                >
                  {t('common.remove', 'Remove')}
                </Button>
              </div>
            )}
            {files.srt && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                padding: '16px',
                background: 'rgba(38, 38, 38, 0.8)',
                borderRadius: '12px',
                border: '1px solid rgba(82, 196, 26, 0.3)',
                backdropFilter: 'blur(10px)'
              }}>
                <Space size="middle">
                  <div style={{
                    width: '36px',
                    height: '36px',
                    background: 'linear-gradient(135deg, #52c41a 0%, #73d13d 100%)',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(82, 196, 26, 0.3)'
                  }}>
                    <FileTextOutlined style={{ color: '#ffffff', fontSize: '16px' }} />
                  </div>
                  <div>
                    <Text style={{ color: '#ffffff', fontWeight: 600, display: 'block', fontSize: '14px' }}>
                      {files.srt.name}
                    </Text>
                    <Text style={{ color: '#cccccc', fontSize: '13px' }}>
                      {t('import.subtitle_file', 'Subtitle File')}
                    </Text>
                  </div>
                </Space>
                <Button 
                  size="small" 
                  type="text" 
                  onClick={() => removeFile('srt')}
                  style={{ 
                    color: '#ff6b6b',
                    borderRadius: '8px',
                    padding: '4px 12px',
                    fontSize: '12px'
                  }}
                >
                  {t('common.remove', 'Remove')}
                </Button>
              </div>
            )}
          </Space>
          
          {/* AI字幕生成提示 */}
          {files.video && !files.srt && (
            <div style={{
              marginTop: '12px',
              padding: '12px 16px',
              background: 'rgba(82, 196, 26, 0.1)',
              border: '1px solid rgba(82, 196, 26, 0.3)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <SubnodeOutlined style={{ color: '#6366f1', fontSize: '16px' }} />
              <Text style={{ color: '#6366f1', fontSize: '14px', fontWeight: 500 }}>
                {t('import.ai_subtitle_notice', 'Subtitles will be automatically generated using AI speech recognition')}
              </Text>
            </div>
          )}
        </div>
      )}

      {/* 导入进度 */}
      {uploading && (
        <div style={{ 
          marginBottom: '16px',
          padding: '20px',
          background: 'rgba(38, 38, 38, 0.8)',
          borderRadius: '16px',
          border: '1px solid rgba(79, 172, 254, 0.3)',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{ marginBottom: '12px' }}>
            <Text style={{ color: '#ffffff', fontWeight: 600, fontSize: '14px' }}>导入进度</Text>
            <Text style={{ color: '#4facfe', float: 'right', fontWeight: 600, fontSize: '14px' }}>
              {uploadProgress}%
            </Text>
          </div>
          <Progress 
            percent={uploadProgress} 
            status="active"
            strokeColor={{
              '0%': '#4facfe',
              '100%': '#00f2fe',
            }}
            trailColor="#404040"
            strokeWidth={6}
            showInfo={false}
            style={{ marginBottom: '8px' }}
          />
          <Text style={{ color: '#cccccc', fontSize: '13px', marginTop: '8px', display: 'block', textAlign: 'center' }}>
            正在导入文件，请稍候...
          </Text>
        </div>
      )}

      {/* 上传按钮 - 只有在选择文件后才显示 */}
      {files.video && (
        <div style={{ textAlign: 'center', marginTop: '8px' }}>
          <Button 
            type="primary" 
            size="large"
            loading={uploading}
            disabled={!files.video || !projectName.trim()}
            onClick={handleUpload}
            style={{
              height: '48px',
              padding: '0 32px',
              borderRadius: '24px',
              background: uploading ? '#666666' : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              border: 'none',
              fontSize: '16px',
              fontWeight: 600,
              boxShadow: uploading ? 'none' : '0 4px 20px rgba(99, 102, 241, 0.4)',
              transition: 'all 0.3s ease'
            }}
          >
            {uploading ? t('import.importing', 'Importing...') : t('import.start_import', 'Start Import & Process')}
          </Button>
        </div>
      )}
    </div>
  )
}

export default React.memo(FileUpload)