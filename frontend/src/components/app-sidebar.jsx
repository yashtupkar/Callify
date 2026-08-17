import * as React from "react"
import { NavMain } from "@/components/nav-main"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { LayoutDashboardIcon, PhoneIcon, BotIcon } from "lucide-react"

const data = {
  navMain: [
    {
      title: "Agents",
      url: "/dashboard/agents",
      icon: <BotIcon />,
    },
    {
      title: "Phone Numbers",
      url: "/dashboard/phone-numbers",
      icon: <PhoneIcon />,
    },
  ]
}

export function AppSidebar({ ...props }) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<a href="#" />}>
              <LayoutDashboardIcon className="size-5!" />
              <span className="text-base font-semibold">Callify Admin</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
    </Sidebar>
  );
}
