# AIOps Operating Fabric 收口计划

日期：2026-06-25

## 背景

当前平台已经具备主机、网络设备、Kubernetes、Hermes、Workflow、审批、任务、Case、拓扑和进化治理等能力，但用户进入平台后仍然容易感觉功能散乱。下一阶段不再以“增加页面”为主，而是把能力组织成一条清晰的运维主线：

首页态势 -> 自动关联/诊断 -> Hermes 会话 -> 审批任务 -> 验证复盘 -> 进化提案。

## 目标原则

1. 首页保留大屏能力，但不只展示泛化指标，要能覆盖主机、Kubernetes 集群、网络设备、闭环处理和拓扑准确性。
2. 优先自动化：能自动采集、自动关联、自动诊断、自动回写的，不要求操作者反复手工跳转。
3. AIOps 必须闭环：资产、告警、Case、Hermes、审批、任务、验证、复盘、进化提案必须能沿同一条 correlation 链路追踪。
4. Hermes 支持单独开 Session，但 Session 必须受 Channel、角色、工具策略和上下文边界控制。
5. 设备关系图继续保留，但边的来源、置信度、验证状态必须清晰，不能把推断关系伪装成已验证关系。

## 一期：信息架构与首页态势收口

### 1. 首页保留“大屏”

保留原来的全屏大屏页面，并在首页增加轻量版“全局运维态势”区域：

- 主机：总数、启用数、在线数、CPU/内存/磁盘最新平均值、指标新鲜度。
- Kubernetes：集群、节点、Pod、Workload、节点绑定主机比例、异常 Pod/Workload、Warning 事件。
- 网络设备：设备总数、在线、告警、离线、未知。
- 闭环：待处理告警、打开的 Case、待审批、运行/失败任务、24 小时 Hermes 会话、待处理进化提案。
- 拓扑准确性：显式依赖数、过期依赖数、未绑定 Kubernetes 节点、准确性评分。

首页只展示“该看哪里、该做什么”，复杂图表仍跳转到全屏大屏和拓扑页。

### 2. 自动化优先

已有能力：

- Kubernetes 资产同步时会用节点名、internal IP、external IP 尝试自动绑定主机。
- 拓扑服务会在全局拓扑中展示 Kubernetes Cluster -> Node -> Server -> Pod/Service/Workload 的关系。

下一步增强：

- 增加 Kubernetes 节点绑定重算入口，支持自动重算和人工修正。
- 定时运行：集群同步、主机指标采集、拓扑验证、MCP/Skill/Channel 健康巡检。
- 自动把严重告警或异常资产创建/关联 Case，并触发 Hermes 诊断 Session。
- 自动把审批、任务、验证、复盘和进化提案回写到 Case 时间线。

### 3. Kubernetes 与背后主机关联

关联策略分两类：

- 自动关联：节点名、hostname、主机 IP、private IP、Kubernetes internal/external IP 精确匹配。
- 手动关联：在 Kubernetes 资产页或拓扑页手动绑定节点与主机，用于云厂商命名不一致、NAT、双网卡等场景。

产品呈现：

- 每个 Kubernetes 节点展示绑定主机、绑定来源、最后同步时间。
- 首页展示绑定率和未绑定节点数。
- 拓扑图中把自动推断边标为 inferred，把人工确认边标为 verified/manual。

### 4. 独立 Hermes Session

支持单独打开 Hermes Session，但不做裸连容器：

- 用户选择 Channel：诊断、修复编排、复盘进化。
- 可选上下文：Case、告警、主机、Kubernetes 集群、网络设备、拓扑节点。
- 后端按当前用户角色、Channel 工具策略和风险级别创建受控 Session。
- Session 输出自动持久化到 `hermes_sessions`，并按 correlationId 回写 Case。

这可以满足“单独连接 Hermes”的体验，同时保证工具调用、审批和审计边界不被绕过。

### 5. 准确拓扑

拓扑图继续作为核心入口，但需要区分关系来源：

- manual：人工维护。
- discovered：自动发现。
- k8s_binding：Kubernetes 节点与主机绑定。
- service_selector：Kubernetes Service selector 推断。
- verified：近期验证通过。
- stale：超过验证窗口。
- unknown：未验证。

首页和拓扑页都要提示“不准确点”：

- 未绑定 Kubernetes 节点。
- 过期依赖边。
- 无指标或指标过期的主机。
- 未巡检或异常的网络设备。

## 二期：闭环自动化骨架

1. 从告警、异常资产、拓扑异常自动创建或关联 Operation Case。
2. Case 自动触发 Hermes 诊断 Channel。
3. Hermes 输出建议动作，按策略进入只读、需审批或自动执行。
4. 审批通过后创建 Workflow Task。
5. Task 完成后自动触发验证。
6. 验证结果回写 Case，并触发复盘 Channel。
7. 复盘产生 Skill/MCP/Workflow/Policy 进化提案。
8. 提案走 evaluation -> staging replay -> approval -> publish。

## 三期：产品化收口

1. 首页只保留全局态势、开始入口、待办和闭环进度。
2. 诊断中心负责“哪里坏了、影响什么、证据是什么”。
3. 执行中心负责“要不要修、谁审批、任务跑到哪一步”。
4. 资产与连接负责主机、网络、Kubernetes、凭证、终端、Kite。
5. Hermes 控制台负责 Channel、Agent、Skill、MCP、工具策略和受控 Session。
6. 拓扑页负责关系准确性、影响面分析和上下游导航。
7. 进化治理负责提案、评估、回放、审批、发布和回滚。

## 一期交付清单

- 新增首页全局运维态势摘要。
- 新增 `/api/dashboard/ops-overview` 聚合接口。
- 首页展示主机、Kubernetes、网络设备、闭环、拓扑准确性。
- 保留原全屏大屏入口。
- 文档固化 Hermes Session、Kubernetes 主机关联、准确拓扑和自动化闭环方向。

## 一期优化补充：运维工作台入口收口

日期：2026-06-26

这轮优化把“资产与连接”调整为“资源与连接”，并把它放到运维工作台第一入口。产品逻辑是：

1. 先确认资源与连接：主机、网络设备、Kubernetes 集群、认证凭证、终端/Kite 入口。
2. 再进入诊断中心：带资源上下文创建或关联 Case，启动 Hermes 诊断。
3. Case 工作台承接闭环主线：沉淀证据、审批、任务、验证、复盘。
4. 执行中心只负责受控变更：审批门禁、任务执行、日志观察和验证。
5. Hermes 控制台负责能力侧治理：Channel、Agent、Skill、MCP、工具策略和 Session。

Kubernetes 节点背后主机关联继续走“三段式”：

- 自动匹配：按节点名、Internal IP、External IP 匹配平台已有主机，不覆盖已有人工确认绑定。
- 自动配置：未命中时自动登记禁用状态的“待接入主机”，写入 hostname/IP/tags/cloud_provider/cloud_instance_id，并绑定到 Kubernetes Node；该主机默认不能执行命令，配置凭证并启用后才进入执行面。
- 手动指定：进入集群详情，在节点行上绑定或调整背后主机，用于云厂商命名不一致、NAT、双网卡等情况。

页面呈现要求：

- 运维工作台导航从“资源与连接”开始。
- Kubernetes 集群页明确展示“自动匹配 -> 自动配置待接入主机 -> 拓扑/Case 上下文”的路径。
- 绑定率、未绑定节点、关联主机数必须在页面顶部可见。
- 长主机名、节点 IP、绑定主机信息不能挤压布局，必要时换行或截断。
