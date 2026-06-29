import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import {
  LayoutDashboard,
  Bot,
  Brain,
  Cable,
  GitBranch,
  Play,
  Bell,
  BookOpen,
  FileCode,
  Settings,
  Server,
  Shield,
  FileText,
  MessageSquare,
  Clock,
  Link2,
  Users,
  Search,
  LogOut,
  User as UserIcon,
  Terminal,
  MonitorPlay,
  Wrench,
  ListChecks,
  BarChart3,
  Network,
  Sun,
  Moon,
  Key,
  Lightbulb,
  Workflow,
  ChevronDown,
  ChevronRight,
  Home,
  ServerCog,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  BookMarked,
  Cog,
  Languages,
  KanbanSquare,
  Gauge,
  Sparkles,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { MessageKey, useLocale } from '../../contexts/LocaleContext';
import ChatWidget from '../ChatWidget';

const navigationGroups: Array<{
  id: string;
  labelKey: MessageKey;
  icon: typeof Home;
  items: Array<{ labelKey: MessageKey; href: string; icon: typeof Home }>;
}> = [
  {
    id: 'home',
    labelKey: 'nav.home',
    icon: Home,
    items: [
      { labelKey: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard },
    ]
  },
  {
    id: 'operatorWorkspace',
    labelKey: 'nav.operatorWorkspace',
    icon: ServerCog,
    items: [
      { labelKey: 'nav.assetsCenter', href: '/assets-center', icon: Cable },
      { labelKey: 'nav.diagnosisCenter', href: '/diagnosis-center', icon: AlertTriangle },
      { labelKey: 'nav.operationCases', href: '/operation-cases', icon: ListChecks },
      { labelKey: 'nav.executionCenter', href: '/execution-center', icon: Workflow },
    ]
  },
  {
    id: 'platformControl',
    labelKey: 'nav.platformControl',
    icon: Cog,
    items: [
      { labelKey: 'nav.platformOverview', href: '/platform-control', icon: Gauge },
      { labelKey: 'nav.hermesConsole', href: '/hermes-console', icon: Brain },
      { labelKey: 'nav.evolutionGovernance', href: '/evolution-governance', icon: Sparkles },
      { labelKey: 'nav.platformOperations', href: '/platform-operations', icon: Gauge },
      { labelKey: 'nav.settings', href: '/settings', icon: Settings },
    ]
  },
];

export default function Layout() {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['home', 'operatorWorkspace', 'platformControl'])
  );

  const toggleGroup = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { locale, setLocale, t } = useLocale();
  const navigate = useNavigate();

  // 使用 staleTime 优化查询，5分钟内使用缓存数据，避免频繁重新请求
  const { data: agentCount } = useQuery({
    queryKey: ['agents-count'],
    queryFn: async () => {
      const res = await api.get('/api/agents');
      return (res.data.data as Array<{ enabled: number }>).filter((a) => a.enabled === 1).length;
    },
    refetchInterval: 60000,
    staleTime: 5 * 60 * 1000,
  });

  const { data: workflowCount } = useQuery({
    queryKey: ['workflows-count'],
    queryFn: async () => {
      const res = await api.get('/api/workflows');
      return (res.data.data as Array<{ is_template: number }>).filter((w) => w.is_template === 1).length;
    },
    refetchInterval: 60000,
    staleTime: 5 * 60 * 1000,
  });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getRoleText = (role: string) => {
    const roleMap: Record<string, string> = {
      'admin': t('role.admin'),
      'operator': t('role.operator'),
      'viewer': t('role.viewer')
    };
    return roleMap[role] || role;
  };

  return (
    <div className={clsx('flex h-screen', theme === 'dark' ? 'bg-background' : 'bg-gray-50')}>
      <aside className={clsx('w-56 flex flex-col backdrop-blur-xl shadow-2xl border-r',
        theme === 'dark'
          ? 'bg-surface/95 border-border'
          : 'bg-white/95 border-gray-200'
      )}>
        <div className={clsx('p-4 border-b',
          theme === 'dark' ? 'border-border' : 'border-gray-200'
        )}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center bg-secondary shadow-lg shadow-black/20 border border-border flex-shrink-0">
              <img src="/logo.jpg" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className={clsx('text-base font-bold tracking-tight',
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              )}>AIOps Agent</h1>
              <p className={clsx('text-[11px]',
                theme === 'dark' ? 'text-slate-400' : 'text-gray-500'
              )}>{t('app.subtitle')}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-2 overflow-y-auto scrollbar-thin">
          {navigationGroups.map((group) => (
            <div key={group.id} className="space-y-0.5">
              <button
                onClick={() => toggleGroup(group.id)}
                className={clsx(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-200 group',
                  theme === 'dark'
                    ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100/50'
                )}
              >
                <group.icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="flex-1 text-left">{t(group.labelKey)}</span>
                {expandedGroups.has(group.id) ? (
                  <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
                )}
              </button>
              
              {expandedGroups.has(group.id) && (
                <div className="pl-2 space-y-0.5">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.href}
                      to={item.href}
                      className={({ isActive }) =>
                        clsx(
                          'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 group',
                          isActive
                            ? 'bg-primary text-white shadow-lg shadow-black/20'
                            : theme === 'dark'
                              ? 'text-slate-400 hover:bg-slate-800/80 hover:text-white'
                              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        )
                      }
                    >
                      <item.icon className="w-4 h-4 group-hover:scale-110 transition-transform flex-shrink-0" />
                      {t(item.labelKey)}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className={clsx('border-t',
          theme === 'dark' ? 'border-border' : 'border-gray-200'
        )}>
          <div className="p-3">
            {user && (
              <div className="flex items-center gap-2 mb-3">
                <div className={clsx('flex items-center gap-2 p-2 rounded-lg flex-1 min-w-0',
                  theme === 'dark' ? 'bg-slate-800/50' : 'bg-gray-100'
                )}>
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center border border-primary/25 flex-shrink-0">
                    <UserIcon className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={clsx('text-xs font-semibold truncate leading-tight',
                      theme === 'dark' ? 'text-white' : 'text-gray-900'
                  )}>
                    {user.username}
                  </p>
                    <p className="text-[10px] text-slate-400 truncate leading-tight">
                      {getRoleText(user.role)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 flex-shrink-0"
                  title="退出登录"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className={clsx('flex items-center justify-between rounded-lg px-3 py-2 mb-2',
              theme === 'dark'
                ? 'bg-secondary border border-border'
                : 'bg-gray-50 border border-gray-200'
            )}>
              <div className="flex items-center gap-2 min-w-0">
                <Languages className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span className={clsx('text-xs font-semibold',
                  theme === 'dark' ? 'text-slate-200' : 'text-gray-800'
                )}>{t('common.language')}</span>
              </div>
              <button
                data-i18n-skip="true"
                onClick={() => setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN')}
                className={clsx('px-2 py-1 rounded-md text-[11px] font-semibold transition-colors',
                  theme === 'dark'
                    ? 'bg-slate-800 text-slate-300 hover:text-white'
                    : 'bg-white text-gray-700 hover:text-gray-900 border border-gray-200'
                )}
              >
                {locale === 'zh-CN' ? 'EN' : '中'}
              </button>
            </div>

            <div className={clsx('flex items-center justify-between rounded-lg px-3 py-2.5',
              theme === 'dark'
                ? 'bg-secondary border border-border'
                : 'bg-gray-50 border border-gray-200'
            )}>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shadow shadow-green-500/30" />
                <div>
                  <span className={clsx('text-xs font-semibold leading-tight',
                    theme === 'dark' ? 'text-white' : 'text-gray-900'
                  )}>{t('layout.status.ok')}</span>
                  <p className="text-[10px] text-slate-400 leading-tight">
                    {t('layout.status.summary', { agents: agentCount ?? '...', workflows: workflowCount ?? '...' })}
                  </p>
                </div>
              </div>
              <button
                onClick={toggleTheme}
                className={clsx('p-1.5 rounded-lg transition-all duration-200 flex-shrink-0',
                  theme === 'dark'
                    ? 'text-slate-400 hover:text-amber-300 hover:bg-slate-700/60'
                    : 'text-gray-400 hover:text-teal-700 hover:bg-gray-200'
                )}
                title={theme === 'dark' ? t('layout.theme.light') : t('layout.theme.dark')}
              >
                {theme === 'dark' ? (
                  <Sun className="w-3.5 h-3.5" />
                ) : (
                  <Moon className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      <ChatWidget />
    </div>
  );
}
