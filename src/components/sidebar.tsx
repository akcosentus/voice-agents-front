"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  AudioLines,
  Bot,
  ChevronLeft,
  ChevronRight,
  Layers,
  LogOut,
  MoreHorizontal,
  Phone,
  PhoneCall,
  Settings,
  User,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

const sections = [
  {
    label: "Build",
    items: [
      { href: "/agents", label: "Agents", icon: Bot },
      { href: "/voices", label: "Voices", icon: AudioLines },
      { href: "/phone-numbers", label: "Phone Numbers", icon: Phone },
    ],
  },
  {
    label: "Monitor",
    items: [
      { href: "/calls", label: "Calls", icon: PhoneCall },
      { href: "/batches", label: "Batches", icon: Layers },
    ],
  },
]

const USER_DISPLAY = "Alex K."
const USER_EMAIL_PREVIEW = "akashkarian@..."

export function AppSidebar() {
  const pathname = usePathname()
  const { state, setOpen, isMobile } = useSidebar()
  const expanded = state === "expanded"
  /** Desktop collapsed rail: icon only. Mobile sheet always shows labels (sidebar `state` follows desktop open). */
  const showNavLabels = expanded || isMobile

  return (
    <SidebarRoot
      collapsible="icon"
      className="group/side-nav"
      onClick={(e) => {
        if (!expanded && !isMobile) {
          const target = e.target as HTMLElement
          if (target.closest("a, button, [role='button']")) return
          setOpen(true)
        }
      }}
      style={!expanded && !isMobile ? { cursor: "pointer" } : undefined}
    >
      <SidebarHeader
        className={cn(
          "border-b border-black/[0.06]",
          expanded ? "px-4 py-3.5" : "px-0 py-3"
        )}
      >
        {isMobile ? (
          <div className="flex items-center px-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/cosentus-logo.png"
              alt="Cosentus"
              className="h-7 object-contain object-left"
              style={{ filter: "brightness(0)" }}
            />
          </div>
        ) : expanded ? (
          <div className="flex items-center justify-between gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/cosentus-logo.png"
              alt="Cosentus"
              className="h-7 min-w-0 flex-1 object-contain object-left"
              style={{ filter: "brightness(0)" }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-muted-foreground opacity-0 transition-opacity duration-200 hover:bg-black/[0.06] hover:text-foreground group-hover/side-nav:opacity-100"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              onClick={() => setOpen(false)}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
          </div>
        ) : (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="expand-chevron text-muted-foreground hover:bg-black/[0.06] hover:text-foreground"
              aria-label="Expand sidebar"
              title="Expand sidebar"
              onClick={() => setOpen(true)}
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="group-data-[collapsible=icon]:gap-2 group-data-[collapsible=icon]:py-2">
        {sections.map((section) => (
          <SidebarGroup
            key={section.label}
            className="group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-0"
          >
            <SidebarGroupLabel className="text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground">
              {section.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    pathname.startsWith(item.href + "/")
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={item.label}
                        render={
                          <Link
                            href={item.href}
                            {...(!showNavLabels ? { "aria-label": item.label } : {})}
                          />
                        }
                      >
                        <item.icon size={showNavLabels ? 18 : 20} />
                        {showNavLabels ? <span>{item.label}</span> : null}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className={cn(!expanded && !isMobile && "px-3 pb-3 pt-2")}>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "flex w-full items-center rounded-xl outline-none transition-colors",
                    expanded || isMobile
                      ? "gap-3 bg-black/[0.03] px-3 py-3 text-left hover:bg-black/[0.06]"
                      : "justify-center px-0 py-2 hover:bg-black/[0.04]"
                  )}
                >
                  <div
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full",
                      expanded || isMobile
                        ? "bg-white ring-1 ring-black/[0.06]"
                        : "bg-black/[0.08] text-foreground"
                    )}
                  >
                    <User
                      className={cn(
                        "size-[18px]",
                        expanded || isMobile ? "text-muted-foreground" : "text-foreground"
                      )}
                      aria-hidden
                    />
                  </div>
                  {(expanded || isMobile) && (
                    <>
                      <div className="grid min-w-0 flex-1 leading-tight">
                        <span className="truncate text-sm font-medium">{USER_DISPLAY}</span>
                        <span className="truncate text-xs text-muted-foreground">{USER_EMAIL_PREVIEW}</span>
                      </div>
                      <MoreHorizontal className="ml-auto size-4 shrink-0 text-muted-foreground" />
                    </>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-48"
                side="top"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuItem>
                  <Settings size={14} />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">
                  <LogOut size={14} />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </SidebarRoot>
  )
}
