'use client'

import { Bell, LogOut, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { useRouter } from 'next/navigation'

interface TopBarProps {
  user: { email: string }
  plan: string
  alertCount?: number
  title?: string
}

export function TopBar({ user, plan, alertCount = 0, title }: TopBarProps) {
  const router = useRouter()

  async function handleSignOut() {
    await fetch('/api/auth/signout', { method: 'POST' })
    router.push('/auth/signin')
  }

  const planVariants: Record<string, 'secondary' | 'default' | 'warning'> = {
    starter: 'secondary',
    pro: 'default',
    agency: 'warning',
  }

  return (
    <header className="fixed top-0 left-64 right-0 h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 z-20">
      <h1 className="text-lg font-semibold text-gray-900">{title ?? 'Dashboard'}</h1>

      <div className="flex items-center gap-3">
        <Badge variant={planVariants[plan] ?? 'secondary'} className="capitalize">
          {plan}
        </Badge>

        {alertCount > 0 && (
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="w-5 h-5 text-gray-500" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
              {alertCount}
            </span>
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <User className="w-5 h-5 text-gray-500" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium truncate">{user.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-red-600 cursor-pointer">
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
