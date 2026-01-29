"use client"
import { cn } from "@/lib/utils"
import { PageError } from "@/components/page-error"
import { PageLoader } from "@/components/page-loader"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useGetMembers } from "@/features/members/api/use-get-members"
import { MemberAvatar } from "@/features/members/components/member-avatar"
import type { Member } from "@/features/members/types"
import { useGetProjects } from "@/features/projects/api/use-get-projects"
import { ProjectAvatar } from "@/features/projects/components/project-avatar"
import { useCreateProjectModal } from "@/features/projects/hooks/use-create-project-modal"
import type { Project } from "@/features/projects/types"
import { useGetWorkItems, useCreateWorkItemModal, WorkItemStatus, WorkItemPriority, type PopulatedWorkItem } from "@/features/sprints"
import { useGetWorkspaceAnalytics } from "@/features/workspaces/api/use-get-workspace-analytics"
import { useWorkspaceId } from "@/features/workspaces/hooks/use-workspace-id"
import { useCurrentMember } from "@/features/members/hooks/use-current-member"
import { useCurrent } from "@/features/auth/api/use-current"

import { formatDistanceToNow, format } from "date-fns"
import {
  CalendarIcon,
  PlusIcon,
  SettingsIcon,
  Users,

  Clock,
  ListTodo,
  Layers,
  FolderKanban,
  ExternalLink,
  TrendingUp,
  ArrowUpRight,
  MoreHorizontal,
  FileText,
} from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"
import {
  ResponsiveContainer,
  Tooltip,
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"

// Mini bar chart component for stat cards - uses semantic colors based on variant
const MiniBarChart = ({ value, max, variant = "default" }: { value: number; max: number; variant?: "default" | "dotted" | "blocks" }) => {
  const bars = 12
  const filledBars = Math.round((value / Math.max(max, 1)) * bars)

  // dotted variant - used for pending/warning states (amber)
  if (variant === "dotted") {
    return (
      <div className="flex items-end gap-0.5 h-8">
        {Array.from({ length: bars }).map((_, i) => (
          <div
            key={i}
            className={`w-1.5 rounded-sm ${i < filledBars ? 'bg-amber-500' : 'bg-amber-500/20'}`}
            style={{ height: `${20 + (i * 5) % 30 + 20}%` }}
          />
        ))}
      </div>
    )
  }

  // blocks variant - used for completed/success states (emerald)
  if (variant === "blocks") {
    return (
      <div className="flex items-end gap-1 h-8">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`w-3 h-6 rounded-sm ${i < Math.ceil(filledBars / 2) ? 'bg-emerald-500' : 'bg-emerald-500/20'}`}
          />
        ))}
      </div>
    )
  }

  // default variant - neutral/black for totals
  return (
    <div className="flex items-end gap-0.5 h-8">
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className={`w-1 rounded-sm ${i < filledBars ? 'bg-foreground' : 'bg-muted'}`}
          style={{ height: `${30 + (i * 7) % 40 + 30}%` }}
        />
      ))}
    </div>
  )
}

export const WorkspaceIdClient = () => {
  const workspaceId = useWorkspaceId()
  const { data: user } = useCurrent()
  const { data: analytics, isLoading: isLoadingAnalytics } = useGetWorkspaceAnalytics({ workspaceId })
  const { data: workItems, isLoading: isLoadingWorkItems } = useGetWorkItems({ workspaceId })
  const { data: projects, isLoading: isLoadingProjects } = useGetProjects({ workspaceId })
  const { data: members, isLoading: isLoadingMembers } = useGetMembers({ workspaceId })

  const isLoading = isLoadingAnalytics || isLoadingWorkItems || isLoadingProjects || isLoadingMembers

  // Calculate dynamic data from real work items
  const dynamicData = useMemo(() => {
    if (!workItems?.documents || !members?.documents) {
      return {
        statusOverview: [],
        priorityDistribution: [],
        memberWorkload: [],
        recentWorkItems: [],
        dueSoonWorkItems: [],
        completionRate: 0,
        flaggedCount: 0,
        contributionData: [],
        monthlyData: [],
        projectStats: [],
      }
    }

    const itemDocs = workItems.documents as PopulatedWorkItem[]
    const memberDocs = members.documents

    // Status overview for pie chart
    const statusCounts = {
      completed: itemDocs.filter(t => t.status === WorkItemStatus.DONE).length,
      inProgress: itemDocs.filter(t => t.status === WorkItemStatus.IN_PROGRESS || t.status === WorkItemStatus.IN_REVIEW).length,
      todo: itemDocs.filter(t => t.status === WorkItemStatus.TODO || t.status === WorkItemStatus.ASSIGNED).length,
    }

    const statusOverview = [
      { id: "completed", name: "Done", value: statusCounts.completed, color: "#22c55e" },
      { id: "in-progress", name: "In Progress", value: statusCounts.inProgress, color: "#2663ec" },
      { id: "todo", name: "To Do", value: statusCounts.todo, color: "#e5e7eb" },
    ]

    // Completion rate
    const completionRate = itemDocs.length > 0
      ? Math.round((statusCounts.completed / itemDocs.length) * 100)
      : 0

    // Flagged count
    const flaggedCount = itemDocs.filter(t => t.flagged === true).length

    // Priority distribution for bar chart
    const priorityDistribution = [
      { name: "URGENT", count: itemDocs.filter(t => t.priority === WorkItemPriority.URGENT).length, fill: "#ef4444" },
      { name: "HIGH", count: itemDocs.filter(t => t.priority === WorkItemPriority.HIGH).length, fill: "#f87171" },
      { name: "MEDIUM", count: itemDocs.filter(t => t.priority === WorkItemPriority.MEDIUM).length, fill: "#eab308" },
      { name: "LOW", count: itemDocs.filter(t => t.priority === WorkItemPriority.LOW).length, fill: "#22c55e" },
    ]

    // Monthly data for bar chart (based on actual task creation dates)
    const now = new Date()
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May']
    const currentMonth = now.getMonth()
    const monthlyData = months.map((month, idx) => {
      const monthIndex = (currentMonth - 4 + idx + 12) % 12
      const monthItems = itemDocs.filter(t => {
        const createdDate = new Date(t.$createdAt)
        return createdDate.getMonth() === monthIndex
      })
      const completedMonthItems = monthItems.filter(t => t.status === WorkItemStatus.DONE)

      return {
        name: month,
        total: monthItems.length > 0 ? monthItems.length : 0,
        completed: completedMonthItems.length,
      }
    })

    // Member workload
    const memberWorkload = memberDocs.map(member => {
      const memberItems = itemDocs.filter(t =>
        t.assigneeIds?.includes(member.$id)
      )
      const completedItems = memberItems.filter(t =>
        t.status === WorkItemStatus.DONE
      ).length

      return {
        id: member.$id,
        name: member.name || member.email || "Unknown",
        avatar: (member.name || member.email || "U").substring(0, 2).toUpperCase(),
        imageUrl: member.profileImageUrl,
        tasks: memberItems.length,
        completedTasks: completedItems,
      }
    }).filter(m => m.tasks > 0).sort((a, b) => b.tasks - a.tasks).slice(0, 4)

    // Contribution data - work items completed per member (for GitHub-style graph)
    const contributionData = memberDocs.map(member => {
      const memberItems = itemDocs.filter(t =>
        t.assigneeIds?.includes(member.$id)
      )
      const completedItems = memberItems.filter(t =>
        t.status === WorkItemStatus.DONE
      ).length

      return {
        id: member.$id,
        name: member.name || member.email?.split('@')[0] || "Unknown",
        imageUrl: member.profileImageUrl,
        completed: completedItems,
        total: memberItems.length,
      }
    }).filter(m => m.total > 0).sort((a, b) => b.completed - a.completed).slice(0, 6)

    // Recent work items
    const recentWorkItems = [...itemDocs]
      .sort((a, b) => new Date(b.$updatedAt).getTime() - new Date(a.$updatedAt).getTime())
      .slice(0, 5)
      .map(item => {
        const assignee = item.assignees?.[0]
        return {
          id: item.$id,
          title: item.title,
          status: item.status === WorkItemStatus.DONE ? "Completed" :
            item.status === WorkItemStatus.IN_PROGRESS || item.status === WorkItemStatus.IN_REVIEW ? "In Progress" : "To Do",
          assignee: assignee?.name || "Unassigned",
          assigneeImage: assignee?.profileImageUrl,
          priority: item.priority || "MEDIUM",
          projectId: item.projectId,
          project: item.project?.name || "No Project",
          dueDate: item.dueDate ? new Date(item.dueDate) : null,
        }
      })

    // Due soon work items
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const dueSoonWorkItems = itemDocs
      .filter(item => {
        if (!item.dueDate || item.status === WorkItemStatus.DONE) return false
        const dueDate = new Date(item.dueDate)
        return dueDate >= now && dueDate <= weekFromNow
      })
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
      .slice(0, 6)
      .map(t => ({
        id: t.$id,
        title: t.title,
        dueDate: new Date(t.dueDate!),
      }))

    // Project stats
    const projectStats = projects?.documents?.slice(0, 3).map((project, idx) => {
      const projectItems = itemDocs.filter(t => t.projectId === project.$id)
      const dueSoon = projectItems.filter(t => {
        if (!t.dueDate || t.status === WorkItemStatus.DONE) return false
        const dueDate = new Date(t.dueDate)
        return dueDate >= now && dueDate <= weekFromNow
      }).length

      return {
        id: project.$id,
        name: project.name,
        dueSoon,
        rank: idx + 1,
      }
    }) || []

    return {
      statusOverview,
      priorityDistribution,
      memberWorkload,
      recentWorkItems,
      dueSoonWorkItems,
      completionRate,
      flaggedCount,
      contributionData,
      monthlyData,
      projectStats,
    }
  }, [workItems, members, projects])

  if (isLoading) {
    return <PageLoader />
  }

  if (!analytics || !workItems || !projects || !members) {
    return <PageError message="Failed to load workspace data." />
  }

  const totalTasks = workItems.total
  const pendingTasks = analytics.incompleteTaskCount
  const completedTasks = analytics.completedTaskCount

  return (
    <div className="h-full  ">
      <div className=" max-w-[1600px] mx-auto">
        {/* Header Section */}
        <div className="mb-8">
          <p className="text-sm text-muted-foreground mb-1">Ready to conquer your projects?</p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Welcome Back, {user?.name?.split(' ')[0] || "User"}.
          </h1>
        </div>

        {/* Main Grid Layout */}
        <div className="grid grid-cols-12 gap-4">
          {/* Left Section - Stats and Charts (9 columns) */}
          <div className="col-span-12 xl:col-span-9 space-y-4">
            {/* Top Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Total Task Card */}
              <Card className="relative overflow-hidden bg-card border border-border shadow-sm hover:shadow-md transition-shadow">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-muted-foreground" />
                <div className="p-4 pl-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-muted-foreground">Total Tasks</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg hover:bg-accent">
                      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/70" />
                    </Button>
                  </div>
                  <div className="flex items-end justify-between">
                    <span className="text-3xl font-semibold tracking-tight text-foreground">{totalTasks}</span>
                    <MiniBarChart value={totalTasks} max={totalTasks + 50} variant="default" />
                  </div>
                </div>
              </Card>

              {/* Pending Task Card */}
              <Card className="relative overflow-hidden bg-card border border-border shadow-sm hover:shadow-md transition-shadow">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500" />
                <div className="p-4 pl-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-muted-foreground">Pending Tasks</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg hover:bg-accent">
                      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/70" />
                    </Button>
                  </div>
                  <div className="flex items-end justify-between">
                    <span className="text-3xl font-semibold tracking-tight text-amber-500">{pendingTasks}</span>
                    <MiniBarChart value={pendingTasks} max={totalTasks} variant="dotted" />
                  </div>
                </div>
              </Card>

              {/* Completed Task Card */}
              <Card className="relative overflow-hidden bg-card border border-border shadow-sm hover:shadow-md transition-shadow">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />
                <div className="p-4 pl-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-muted-foreground">Completed Tasks</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg hover:bg-accent">
                      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/70" />
                    </Button>
                  </div>
                  <div className="flex items-end justify-between">
                    <span className="text-3xl font-semibold tracking-tight text-emerald-500">{completedTasks}</span>
                    <MiniBarChart value={completedTasks} max={totalTasks} variant="blocks" />
                  </div>
                </div>
              </Card>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Project Overview Chart */}
              <Card className="p-5 bg-card border border-border shadow-sm">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-sm font-medium tracking-tight text-foreground">Project Overview</h3>
                  <select className="text-xs bg-muted text-foreground px-2 py-1 rounded-md border border-border focus:ring-2 focus:ring-primary cursor-pointer">
                    <option>This Week</option>
                    <option>This Month</option>
                    <option>This Year</option>
                  </select>
                </div>
                <div className="h-[240px]">
                  {dynamicData.monthlyData.some(m => m.total > 0) ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsBarChart
                        data={dynamicData.monthlyData}
                        margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" className="dark:stroke-slate-700" />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                          axisLine={false}
                          tickLine={false}
                          allowDecimals={false}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            fontSize: '12px',
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                          }}
                          labelStyle={{ color: 'hsl(var(--foreground))' }}
                        />
                        <Bar
                          dataKey="total"
                          fill="#c7d2fe"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={40}
                          name="Total"
                        />
                        <Bar
                          dataKey="completed"
                          fill="#10b981"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={40}
                          name="Completed"
                        />
                      </RechartsBarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                      No task data available yet
                    </div>
                  )}
                </div>
              </Card>

              {/* Task Statistics Card */}
              <Card className="p-5 bg-card border border-border shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium tracking-tight text-foreground">Task Statistics</h3>
                  <select className="text-xs bg-muted text-foreground px-2 py-1 rounded-md border border-border focus:ring-2 focus:ring-primary cursor-pointer">
                    <option>Monthly</option>
                    <option>Weekly</option>
                    <option>Daily</option>
                  </select>
                </div>

                {/* Total Project Count with Trend */}
                <div className="mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-3xl font-bold text-foreground">{totalTasks}</span>
                    <span className="text-xs text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                      ↑ {dynamicData.completionRate}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Total Tasks</p>
                </div>

                {/* Status Legend */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-600" />
                    <span className="text-xs text-muted-foreground">Completed</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-amber-600" />
                    <span className="text-xs text-muted-foreground">Pending</span>
                  </div>
                </div>

                {/* Progress Bar Visualization */}
                <div className="h-3 flex rounded-full overflow-hidden bg-slate-100 dark:bg-slate-700 mb-6">
                  <div
                    className="bg-emerald-600 transition-all"
                    style={{ width: `${(completedTasks / Math.max(totalTasks, 1)) * 100}%` }}
                  />
                  <div
                    className="bg-amber-500 transition-all"
                    style={{ width: `${(pendingTasks / Math.max(totalTasks, 1)) * 100}%` }}
                  />
                </div>

                {/* In Progress / Completed Files */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-foreground">In Progress</p>
                    <div className="flex items-center gap-2 p-2 bg-amber-500/10 rounded-lg">
                      <div className="p-1.5 bg-amber-500/20 rounded">
                        <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate text-foreground">Active Items</p>
                        <p className="text-[10px] text-muted-foreground">{pendingTasks} tasks</p>
                      </div>
                    </div>
                    <Progress value={pendingTasks > 0 ? Math.min((pendingTasks / totalTasks) * 100, 100) : 0} className="h-1 bg-amber-500/20 [&>div]:bg-amber-500" />
                    <p className="text-[10px] text-muted-foreground">Progress... {pendingTasks > 0 ? Math.round((pendingTasks / totalTasks) * 100) : 0}%</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-foreground">Completed</p>
                    <div className="flex items-center gap-2 p-2 bg-emerald-500/10 rounded-lg">
                      <div className="p-1.5 bg-emerald-500/20 rounded">
                        <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate text-foreground">Done Items</p>
                        <p className="text-[10px] text-muted-foreground">{completedTasks} tasks</p>
                      </div>
                    </div>
                    <Progress value={completedTasks > 0 ? Math.min((completedTasks / totalTasks) * 100, 100) : 0} className="h-1 bg-emerald-500/20 [&>div]:bg-emerald-500" />
                    <p className="text-[10px] text-muted-foreground">Completed {completedTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0}%</p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Task List Table */}
            <Card className="p-5 bg-card border border-border shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium tracking-tight text-foreground">Task List</h3>
                <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-accent">
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>

              {/* Table Header */}
              <div className="grid grid-cols-12 gap-4 pb-3 border-b border-border text-xs font-medium text-muted-foreground">
                <div className="col-span-4">Name</div>
                <div className="col-span-2">Project</div>
                <div className="col-span-2">Time</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2">Priority</div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-border">
                {dynamicData.recentWorkItems.length > 0 ? (
                  dynamicData.recentWorkItems.map((task) => (
                    <Link
                      key={task.id}
                      href={`/workspaces/${workspaceId}/tasks/${task.id}`}
                      className="grid grid-cols-12 gap-4 py-3 items-center hover:bg-accent -mx-5 px-5 transition-colors"
                    >
                      <div className="col-span-4 flex items-center gap-3">
                        <MemberAvatar
                          name={task.assignee}
                          imageUrl={task.assigneeImage}
                          className="h-8 w-8"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate text-foreground">{task.assignee}</p>
                          <p className="text-xs text-muted-foreground truncate">{task.title}</p>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <p className="text-sm truncate text-foreground">{task.project}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-sm text-muted-foreground">
                          {task.dueDate ? format(task.dueDate, 'MMM d') : '—'}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${task.status === "Completed"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                          : task.status === "In Progress"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                            : "bg-muted text-muted-foreground"
                          }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${task.status === "Completed" ? "bg-emerald-600" :
                            task.status === "In Progress" ? "bg-amber-600" : "bg-muted-foreground"
                            }`} />
                          {task.status}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className={`text-xs font-medium px-2 py-1 rounded ${task.priority === "URGENT"
                          ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200"
                          : task.priority === "HIGH"
                            ? "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300"
                            : task.priority === "MEDIUM"
                              ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200"
                              : "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200"
                          }`}>
                          {task.priority}
                        </span>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    No tasks yet. Create your first task to get started.
                  </div>
                )}
              </div>

              {workItems.total > 5 && (
                <Link href={`/workspaces/${workspaceId}/tasks`}>
                  <Button variant="ghost" size="sm" className="w-full mt-4 text-xs text-muted-foreground hover:text-foreground hover:bg-accent">
                    View All Tasks <ExternalLink className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
              )}
            </Card>


          </div>

          {/* Right Sidebar (3 columns) */}
          <div className="col-span-12  xl:col-span-3 flex flex-col space-y-4 h-full">
            {/* Due Alerts Card */}
            <Card className="p-5 bg-card border border-border shadow-sm flex-1">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium tracking-tight text-foreground">Due Alerts</h3>
                <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-accent">
                  <PlusIcon className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>

              {dynamicData.dueSoonWorkItems.length > 0 ? (
                <div className="space-y-3">
                  {dynamicData.dueSoonWorkItems.slice(0, 1).map((alert) => (
                    <Link
                      key={alert.id}
                      href={`/workspaces/${workspaceId}/tasks/${alert.id}`}
                      className="block p-4 bg-blue-600 rounded-xl text-white hover:bg-blue-700 transition-all"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate mb-1">{alert.title}</p>
                          <p className="text-xs opacity-90">
                            Due: {format(alert.dueDate, 'MMM d, h:mm a')}
                          </p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-white/70 hover:text-white hover:bg-blue-500">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        className="w-full mt-3 bg-white text-blue-600 hover:bg-blue-50 border-0"
                      >
                        <Clock className="mr-2 h-3 w-3" />
                        View Details
                      </Button>
                    </Link>
                  ))}

                  {dynamicData.dueSoonWorkItems.slice(1, 4).map((alert) => (
                    <Link
                      key={alert.id}
                      href={`/workspaces/${workspaceId}/tasks/${alert.id}`}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
                    >
                      <div className="p-2 bg-muted rounded-lg">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-foreground">{alert.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(alert.dueDate, { addSuffix: true })}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Clock className="h-8 w-8 text-muted/50 dark:text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">No upcoming deadlines</p>
                </div>
              )}
            </Card>

            {/* Task Statistics by Project */}
            <Card className="p-5 bg-card border border-border shadow-sm flex-1">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium tracking-tight text-foreground">Project Statistics</h3>
              </div>

              <div className="space-y-2 max-h-[280px] overflow-y-auto">
                {projects.documents.slice(0, 5).map((project, idx) => {
                  const projectItems = (workItems.documents as PopulatedWorkItem[]).filter(t => t.projectId === project.$id)
                  const dueSoon = projectItems.filter(t => {
                    if (!t.dueDate || t.status === WorkItemStatus.DONE) return false
                    const dueDate = new Date(t.dueDate)
                    const now = new Date()
                    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
                    return dueDate >= now && dueDate <= weekFromNow
                  }).length

                  return (
                    <Link
                      key={project.$id}
                      href={`/workspaces/${workspaceId}/projects/${project.$id}`}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl transition-all",
                        idx === 0 ? "bg-blue-600 text-white hover:bg-blue-700" : "hover:bg-accent"
                      )}
                    >
                      <div className={cn(
                        "flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold",
                        idx === 0 ? "bg-white/20 text-white" : "bg-muted text-foreground"
                      )}>
                        {idx + 1}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-sm font-medium truncate",
                          idx === 0 ? "text-white" : "text-foreground"
                        )}>{project.name}</p>
                        <p className={cn(
                          "text-xs",
                          idx === 0 ? "text-blue-100" : "text-muted-foreground"
                        )}>
                          {dueSoon > 0 ? `${dueSoon} tasks due soon` : `${projectItems.length} total tasks`}
                        </p>
                      </div>

                    </Link>
                  )
                })}

                {projects.total === 0 && (
                  <div className="text-center py-8">
                    <FolderKanban className="h-8 w-8 text-muted/50 dark:text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-slate-500 dark:text-slate-400">No projects yet</p>
                  </div>
                )}
              </div>

              {projects.total > 5 && (
                <Link href={`/workspaces/${workspaceId}/projects`}>
                  <Button variant="ghost" size="sm" className="w-full mt-3 text-xs text-muted-foreground hover:text-foreground hover:bg-accent">
                    View All Projects <ExternalLink className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
              )}
            </Card>

            {/* Team Members Quick View */}
            <Card className="p-5 bg-card border border-border shadow-sm flex-1">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium tracking-tight text-foreground">Team Members</h3>
                <Link href={`/workspaces/${workspaceId}/members`}>
                  <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-accent">
                    <SettingsIcon className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </Link>
              </div>

              <div className="flex flex-wrap gap-2">
                {members.documents.slice(0, 8).map((member) => (
                  <MemberAvatar
                    key={member.$id}
                    name={member.name || member.email || "U"}
                    imageUrl={member.profileImageUrl}
                    className="h-10 w-10 border-2 border-border"
                  />
                ))}
                {members.total > 8 && (
                  <div className="flex items-center justify-center h-10 w-10 rounded-full bg-muted text-xs font-medium text-muted-foreground">
                    +{members.total - 8}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground text-xs">Total Members</span>
                  <span className="font-semibold text-foreground">{members.total}</span>
                </div>
                {/* Active Teams Stat Removed */}
              </div>
            </Card>
          </div>
        </div>

        {/* Bottom Row - Workload, Priority & Top Contributors */}
        <div className="grid grid-cols-1 w-full mt-4  lg:grid-cols-3 gap-4">
          {/* Workload Distribution */}
          <Card className="p-5 bg-card border border-border shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium tracking-tight text-foreground">Workload Distribution</h3>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="space-y-4">
              {dynamicData.memberWorkload.length > 0 ? (
                dynamicData.memberWorkload.map((member) => {
                  const workloadPercentage = analytics.taskCount > 0 ? (member.tasks / analytics.taskCount) * 100 : 0
                  return (
                    <div key={member.id} className="space-y-2 pt-2 ">
                      <div className="flex items-center gap-3">
                        <MemberAvatar
                          name={member.name}
                          imageUrl={member.imageUrl}
                          className="h-8 w-8"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-medium truncate text-foreground">{member.name}</p>
                            <span className="text-xs text-muted-foreground">{member.tasks} tasks</span>
                          </div>
                          <Progress
                            value={workloadPercentage}
                            className="h-2"
                          />
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="text-sm text-center text-slate-500 dark:text-slate-400 py-8">
                  No assigned tasks yet
                </div>
              )}
            </div>
          </Card>

          {/* Priority Distribution */}
          <Card className="p-5 bg-card border border-border shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-medium tracking-tight text-foreground">Priority Distribution</h3>
              <Layers className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsBarChart
                  data={dynamicData.priorityDistribution}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" className="dark:stroke-slate-700" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                  />
                  <Bar
                    dataKey="count"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={50}
                  />
                </RechartsBarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Top Contributors */}
          <Card className="p-5 bg-card border border-border shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-medium tracking-tight text-foreground">Top Contributors</h3>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
            {dynamicData.contributionData.length > 0 ? (
              <div className="space-y-3">
                {dynamicData.contributionData.slice(0, 5).map((contributor) => (
                  <div key={contributor.id} className="flex items-center py-1 gap-3">

                    <MemberAvatar
                      name={contributor.name}
                      imageUrl={contributor.imageUrl}
                      className="h-8 w-8"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-foreground">{contributor.name}</p>
                      <p className="text-xs text-muted-foreground">{contributor.completed} completed</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">{contributor.completed}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">/{contributor.total}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[200px] flex flex-col items-center justify-center text-center">
                <TrendingUp className="h-8 w-8 text-muted/50 dark:text-muted-foreground/30 mb-2" />
                <p className="text-sm text-slate-500 dark:text-slate-400">No completed tasks yet</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

interface WorkItemListProps {
  data: PopulatedWorkItem[]
  total: number
}

export const WorkItemList = ({ data, total }: WorkItemListProps) => {
  const workspaceId = useWorkspaceId()
  const { open: createWorkItem } = useCreateWorkItemModal()
  const { isAdmin } = useCurrentMember({ workspaceId })

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ListTodo className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-xs font-medium text-muted-foreground">Work Items ({total})</h3>
        </div>
        {isAdmin && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => createWorkItem()}
            className="h-6 w-6"
          >
            <PlusIcon className="size-3" />
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {data.slice(0, 5).map((item) => (
          <Link
            key={item.$id}
            href={`/workspaces/${workspaceId}/projects/${item.projectId}/backlog?workItemId=${item.$id}`}
            className="flex items-center justify-between p-2 bg-secondary/10 rounded-md hover:bg-secondary/20 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{item.title}</p>
              <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground">
                <span className="truncate">{item.key}</span>
                {item.dueDate && (
                  <>
                    <span>•</span>
                    <CalendarIcon className="size-2.5" />
                    <span>{formatDistanceToNow(new Date(item.dueDate))}</span>
                  </>
                )}
              </div>
            </div>
          </Link>
        ))}
        {data.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No work items</p>
        )}
      </div>
      {data.length > 5 && (
        <Link href={`/workspaces/${workspaceId}/tasks`}>
          <Button variant="ghost" size="sm" className="w-full mt-2 h-7 text-xs gap-1">
            View All <ExternalLink className="size-3" />
          </Button>
        </Link>
      )}
    </Card>
  )
}

interface ProjectListProps {
  data: Project[]
  total: number
}

export const ProjectList = ({ data, total }: ProjectListProps) => {
  const workspaceId = useWorkspaceId()
  const { open: createProject } = useCreateProjectModal()
  const { isAdmin } = useCurrentMember({ workspaceId })

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-xs font-medium text-muted-foreground">Projects ({total})</h3>
        </div>
        {isAdmin && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => createProject()}
            className="h-6 w-6"
          >
            <PlusIcon className="size-3" />
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {data.slice(0, 4).map((project) => (
          <Link
            key={project.$id}
            href={`/workspaces/${workspaceId}/projects/${project.$id}`}
            className="flex flex-col items-center gap-2 p-3 bg-secondary/10 rounded-md hover:bg-secondary/20 transition-colors"
          >
            <ProjectAvatar
              name={project.name}
              image={project.imageUrl}
              className="size-8"
              fallbackClassName="text-xs"
            />
            <p className="text-xs font-medium text-center truncate w-full">{project.name}</p>
          </Link>
        ))}
        {data.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4 col-span-2">No projects</p>
        )}
      </div>
      {data.length > 4 && (
        <Link href={`/workspaces/${workspaceId}/projects`}>
          <Button variant="ghost" size="sm" className="w-full mt-2 h-7 text-xs gap-1">
            View All <ExternalLink className="size-3" />
          </Button>
        </Link>
      )}
    </Card>
  )
}

interface MemberListProps {
  data: Member[]
  total: number
}

export const MemberList = ({ data, total }: MemberListProps) => {
  const workspaceId = useWorkspaceId()

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-xs font-medium text-muted-foreground">Members ({total})</h3>
        </div>
        <Link href={`/workspaces/${workspaceId}/members`}>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <SettingsIcon className="size-3" />
          </Button>
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {data.slice(0, 4).map((member) => {
          const displayName = member.name?.trim() || member.email || "Unknown"
          return (
            <div
              key={member.$id}
              className="flex flex-col items-center gap-2 p-3 bg-secondary/10 rounded-md"
            >
              <MemberAvatar
                name={displayName}
                className="size-8"
                imageUrl={member.profileImageUrl}
              />
              <div className="text-center w-full overflow-hidden">
                <p className="text-xs font-medium truncate">{displayName}</p>
                <p className="text-[11px] text-muted-foreground truncate">{member.role}</p>
              </div>
            </div>
          )
        })}
        {data.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4 col-span-2">No members</p>
        )}
      </div>
      {data.length > 4 && (
        <Link href={`/workspaces/${workspaceId}/members`}>
          <Button variant="ghost" size="sm" className="w-full mt-2 h-7 text-xs gap-1">
            View All <ExternalLink className="size-3" />
          </Button>
        </Link>
      )}
    </Card>
  )
}
