import * as React from "react"

declare module "lucide-react" {
  export interface LucideProps extends React.SVGProps<SVGSVGElement> {
    color?: string
    size?: string | number
    strokeWidth?: string | number
    absoluteStrokeWidth?: boolean
  }

  export type LucideIcon = React.ForwardRefExoticComponent<LucideProps & React.RefAttributes<SVGSVGElement>>

  export const Send: LucideIcon
  export const Paperclip: LucideIcon
  export const X: LucideIcon
  export const ChevronDown: LucideIcon
  export const Sparkles: LucideIcon
  export const MessageSquare: LucideIcon
  export const Zap: LucideIcon
  export const Search: LucideIcon
  export const Eye: LucideIcon
  export const Wrench: LucideIcon
  export const FileCheck: LucideIcon
  export const Loader2: LucideIcon
  export const Globe: LucideIcon
  export const Lightbulb: LucideIcon
  export const Box: LucideIcon
  export const Play: LucideIcon
  export const ChevronRight: LucideIcon
  export const GitBranch: LucideIcon
  export const Link: LucideIcon
  export const Upload: LucideIcon
  export const FolderOpen: LucideIcon
  export const Github: LucideIcon
  export const CheckCircle2: LucideIcon
  export const AlertCircle: LucideIcon
  export const ExternalLink: LucideIcon
  export const Terminal: LucideIcon
  export const RefreshCw: LucideIcon
  export const Shield: LucideIcon
  export const DollarSign: LucideIcon
  export const Info: LucideIcon
  export const Check: LucideIcon
  export const User: LucideIcon
  export const Bot: LucideIcon
  export const Bell: LucideIcon
  export const Keyboard: LucideIcon
  export const Settings2: LucideIcon
  export const Moon: LucideIcon
  export const Sun: LucideIcon
  export const Monitor: LucideIcon
  export const History: LucideIcon
  export const Settings: LucideIcon
  export const ChevronLeft: LucideIcon
  export const Plus: LucideIcon
  export const LogOut: LucideIcon
  export const LogIn: LucideIcon
  export const HelpCircle: LucideIcon
  export const MoreHorizontal: LucideIcon
  export const AlertTriangle: LucideIcon
  export const FileCode: LucideIcon
  export const TestTube: LucideIcon
  export const Copy: LucideIcon
  export const ThumbsUp: LucideIcon
  export const ThumbsDown: LucideIcon
  export const ArrowRight: LucideIcon
  export const Mail: LucideIcon
  export const KeyRound: LucideIcon
  export const Menu: LucideIcon

  export function createLucideIcon(iconName: string, node: React.ReactNode): LucideIcon
}
