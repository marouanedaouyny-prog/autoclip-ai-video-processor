import React, { useState, useEffect } from 'react'
import { 
  Layout, 
  Typography, 
  Select, 
  Spin, 
  Empty,
  message 
} from 'antd'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import ProjectCard from '../components/ProjectCard'
import FileUpload from '../components/FileUpload'
import BilibiliDownload from '../components/BilibiliDownload'

import { projectApi } from '../services/api'
import { Project, useProjectStore } from '../store/useProjectStore'
import { useProjectPolling } from '../hooks/useProjectPolling'
// import { useWebSocket, WebSocketEventMessage } from '../hooks/useWebSocket'  // 已禁用WebSocket系统

const { Content } = Layout
const { Title, Text } = Typography
const { Option } = Select

const HomePage: React.FC = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { projects, setProjects, deleteProject, loading, setLoading } = useProjectStore()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [activeTab, setActiveTab] = useState<'upload' | 'bilibili'>('upload')

  // WebSocket连接已禁用，使用新的简化进度系统
  // const handleWebSocketMessage = (message: WebSocketEventMessage) => {
  //   console.log('HomePage收到WebSocket消息:', message)
  //   
  //   switch (message.type) {
  //     case 'task_progress_update':
  //       console.log('📊 收到任务进度更新:', message)
  //       // 刷新项目列表以获取最新状态
  //       loadProjects()
  //       break
  //       
  //     case 'project_update':
  //       console.log('📊 收到项目更新:', message)
  //       // 刷新项目列表以获取最新状态
  //       loadProjects()
  //       break
  //       
  //     default:
  //       console.log('忽略未知类型的WebSocket消息:', (message as any).type)
  //   }
  // }

  // const { isConnected, syncSubscriptions } = useWebSocket({
  //   userId: 'homepage-user',
  //   onMessage: handleWebSocketMessage
  // })

  // 使用项目轮询Hook
  const { refreshNow } = useProjectPolling({
    onProjectsUpdate: (updatedProjects) => {
      setProjects(updatedProjects || [])
    },
    enabled: true,
    interval: 10000 // 10秒轮询一次
  })

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    setLoading(true)
    try {
      // 从后端API获取真实项目数据
      const projects = await projectApi.getProjects()
      setProjects(projects || [])
    } catch (error) {
      message.error(t('home.load_failed'))
      console.error('Load projects error:', error)
      // 如果API调用失败，设置空数组
      setProjects([])
    } finally {
      setLoading(false)
    }
  }

  // 使用集合差异对齐订阅项目WebSocket主题
  // WebSocket订阅已禁用，使用新的简化进度系统
  // useEffect(() => {
  //   if (isConnected && projects.length > 0) {
  //     const desiredChannels = projects.map(project => `project_${project.id}`)
  //     console.log('同步订阅项目频道:', desiredChannels)
  //     syncSubscriptions(desiredChannels)
  //   } else if (isConnected && projects.length === 0) {
  //     // 如果没有项目，清空所有订阅
  //     console.log('清空所有项目订阅')
  //     syncSubscriptions([])
  //   }
  // }, [isConnected, projects, syncSubscriptions])

  const handleDeleteProject = async (id: string) => {
    try {
      await projectApi.deleteProject(id)
      deleteProject(id)
      message.success(t('home.delete_success'))
    } catch (error) {
      message.error(t('home.delete_failed'))
      console.error('Delete project error:', error)
    }
  }

  const handleRetryProject = async (projectId: string) => {
    try {
      // 查找项目状态
      const project = projects.find(p => p.id === projectId)
      if (!project) {
        message.error(t('home.project_not_exist'))
        return
      }
      
      // 统一使用retryProcessing API，它会自动处理视频文件不存在的情况
      await projectApi.retryProcessing(projectId)
      message.success(t('home.retry_started'))
      
      await loadProjects()
    } catch (error) {
      message.error(t('home.retry_failed'))
      console.error('Retry project error:', error)
    }
  }

  const handleStartProcessing = async (projectId: string) => {
    try {
      await projectApi.startProcessing(projectId)
      message.success(t('home.processing_started'))
      // 立即刷新项目列表以显示最新状态
      setTimeout(async () => {
        try {
          await refreshNow()
        } catch (refreshError) {
          console.error('Failed to refresh after starting processing:', refreshError)
        }
      }, 1000)
    } catch (error: unknown) {
      const errorMessage = (error as { userMessage?: string })?.userMessage || t('home.processing_failed')
      message.error(errorMessage)
      console.error('Start processing error:', error)
      
      // 如果是超时错误，提示用户项目可能仍在处理
      if ((error as { code?: string; message?: string })?.code === 'ECONNABORTED' || (error as { code?: string; message?: string })?.message?.includes('timeout')) {
        message.info(t('home.timeout_info'), 5)
        // 延迟刷新项目列表
        setTimeout(async () => {
          try {
            await refreshNow()
          } catch (refreshError) {
            console.error('Failed to refresh after timeout:', refreshError)
          }
        }, 3000)
      }
    }
  }

  const handleProjectCardClick = (project: Project) => {
    // 导入中状态的项目不能点击进入详情页
    if (project.status === 'pending') {
      message.warning(t('home.pending_warning'))
      return
    }
    
    // 其他状态可以正常进入详情页
    navigate(`/project/${project.id}`)
  }

  const filteredProjects = projects
    .filter(project => {
      const matchesStatus = statusFilter === 'all' || project.status === statusFilter
      return matchesStatus
    })
    .sort((a, b) => {
      // 按创建时间倒序排列，最新的在前面
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

  return (
    <Layout style={{ 
      minHeight: '100vh', 
      background: '#0f0f0f'
    }}>
      <Content style={{ padding: '40px 24px', position: 'relative' }}>
        <div style={{ maxWidth: '1600px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          {/* 大屏改版：将顶部的切换改为更具视觉冲击力的Segmented控制，且卡片设计更新颖 */}
          <div style={{ 
            marginBottom: '48px',
            marginTop: '20px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flexDirection: 'column'
          }}>
            <h1 style={{ color: '#fff', fontSize: '3rem', fontWeight: 800, marginBottom: '24px', textAlign: 'center', letterSpacing: '-1px' }}>
              {t('home.hero_title', 'Studio Importer')}
            </h1>
            <div style={{
              width: '100%',
              maxWidth: '850px',
              background: 'rgba(20, 20, 35, 0.65)',
              backdropFilter: 'blur(40px)',
              WebkitBackdropFilter: 'blur(40px)',
              borderRadius: '24px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '32px',
              boxShadow: '0 24px 48px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1)'
            }}>
              {/* 高级标签页切换 */}
              <div style={{
                display: 'flex',
                marginBottom: '24px',
                borderRadius: '16px',
                background: 'rgba(0, 0, 0, 0.4)',
                padding: '6px',
                border: '1px solid rgba(255,255,255,0.05)'
              }}>
                 <button 
                   style={{
                     flex: 1,
                     padding: '16px 24px',
                     borderRadius: '12px',
                     background: activeTab === 'bilibili' ? '#6366f1' : 'transparent',
                     color: activeTab === 'bilibili' ? '#ffffff' : '#888888',
                     cursor: 'pointer',
                     fontSize: '16px',
                     fontWeight: 600,
                     transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                     border: 'none',
                     boxShadow: activeTab === 'bilibili' ? '0 8px 16px rgba(99, 102, 241, 0.4)' : 'none'
                   }}
                 onClick={() => setActiveTab('bilibili')}
                 >
                   {t('home.link_import', 'Link Import')}
                 </button>
                <button 
                   style={{
                     flex: 1,
                     padding: '16px 24px',
                     borderRadius: '12px',
                     background: activeTab === 'upload' ? '#6366f1' : 'transparent',
                     color: activeTab === 'upload' ? '#ffffff' : '#888888',
                     cursor: 'pointer',
                     fontSize: '16px',
                     fontWeight: 600,
                     transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                     border: 'none',
                     boxShadow: activeTab === 'upload' ? '0 8px 16px rgba(99, 102, 241, 0.4)' : 'none'
                   }}
                 onClick={() => setActiveTab('upload')}
                 >
                   {t('home.file_import', 'File Upload')}
                 </button>
              </div>
              
              {/* 内容区域 */}
              <div>
                {activeTab === 'bilibili' && (
                  <BilibiliDownload onDownloadSuccess={async (projectId: string) => {
                    // 处理完成后刷新项目列表
                    await loadProjects()
                    // 不再显示重复的toast提示，BilibiliDownload组件已经显示了统一的提示
                  }} />
                )}
                {activeTab === 'upload' && (
                  <FileUpload onUploadSuccess={async (projectId: string) => {
                    // 处理完成后刷新项目列表
                    await loadProjects()
                    message.success(t('home.upload_success'))
                  }} />
                )}
              </div>
            </div>
          </div>

          {/* 项目管理区域 */}
          <div style={{
            background: 'rgba(26, 26, 46, 0.7)',
            backdropFilter: 'blur(20px)',
            borderRadius: '24px',
            border: '1px solid rgba(79, 172, 254, 0.15)',
            padding: '32px',
            marginBottom: '32px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.03)'
          }}>
            {/* 项目列表标题区域 */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '24px',
              paddingBottom: '16px',
              borderBottom: '1px solid rgba(79, 172, 254, 0.1)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <Title 
                  level={2} 
                  style={{ 
                    margin: 0,
                    color: '#ffffff',
                    fontSize: '24px',
                    fontWeight: 600,
                    background: 'linear-gradient(135deg, #ffffff 0%, #cccccc 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}
                >
                  {t('home.my_projects')}
                </Title>
                <div style={{
                  padding: '8px 16px',
                  background: 'rgba(79, 172, 254, 0.1)',
                  borderRadius: '20px',
                  border: '1px solid rgba(79, 172, 254, 0.3)',
                  backdropFilter: 'blur(10px)'
                }}>
                  <Text style={{ color: '#4facfe', fontWeight: 600, fontSize: '14px' }}>
                    {t('home.total_projects', { count: filteredProjects.length })}
                  </Text>
                </div>
              </div>
              
              {/* 状态筛选移到右侧 */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center'
              }}>
                <Select
                  placeholder={t('home.select_status')}
                  value={statusFilter}
                  onChange={setStatusFilter}
                  style={{ 
                    minWidth: '140px',
                    height: '36px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(79, 172, 254, 0.2)',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '14px'
                  }}
                  styles={{
                    popup: {
                      root: {
                        background: 'rgba(26, 26, 46, 0.95)',
                        border: '1px solid rgba(79, 172, 254, 0.3)',
                        borderRadius: '8px',
                        backdropFilter: 'blur(20px)',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
                      }
                    }
                  }}
                  suffixIcon={
                    <span style={{ 
                      color: '#8c8c8c', 
                      fontSize: '10px',
                      transition: 'all 0.2s ease'
                    }}>
                      ⌄
                    </span>
                  }
                  allowClear
                >
                  <Option value="all" style={{ color: '#ffffff' }}>{t('home.all_status')}</Option>
                  <Option value="completed" style={{ color: '#52c41a' }}>{t('home.completed')}</Option>
                  <Option value="processing" style={{ color: '#1890ff' }}>{t('home.processing')}</Option>
                  <Option value="error" style={{ color: '#ff4d4f' }}>{t('home.error')}</Option>
                </Select>
              </div>
            </div>

            {/* 项目列表内容 */}
             <div>
               {loading ? (
                 <div style={{ 
                   textAlign: 'center', 
                   padding: '60px 0',
                   background: '#262626',
                   borderRadius: '12px',
                   border: '1px solid #404040'
                 }}>
                   <Spin size="large" />
                   <div style={{ 
                     marginTop: '20px', 
                     color: '#cccccc',
                     fontSize: '16px'
                   }}>
                     {t('home.loading_projects')}
                   </div>
                 </div>
               ) : filteredProjects.length === 0 ? (
                 <div style={{
                   textAlign: 'center',
                   padding: '60px 0',
                   background: '#262626',
                   borderRadius: '12px',
                   border: '1px solid #404040'
                 }}>
                   <Empty
                     image={Empty.PRESENTED_IMAGE_SIMPLE}
                     description={
                       <div>
                         <Text type="secondary">
                           {projects.length === 0 ? t('home.no_projects_yet') : t('home.no_matching_projects')}
                         </Text>
                       </div>
                     }
                   />
                 </div>
               ) : (
                 <div style={{
                   display: 'grid',
                   gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                   gap: '16px',
                   justifyContent: 'start',
                   padding: '6px 0'
                 }}>
                   {filteredProjects.map((project: Project) => (
                     <div key={project.id} style={{ position: 'relative', zIndex: 1 }}>
                       <ProjectCard 
                         project={project} 
                         onDelete={handleDeleteProject}
                         onRetry={() => handleRetryProject(project.id)}
                         onClick={() => handleProjectCardClick(project)}
                       />
                     </div>
                   ))}
                 </div>
               )}
             </div>
           </div>
         </div>
      </Content>
    </Layout>
  )
}

export default HomePage