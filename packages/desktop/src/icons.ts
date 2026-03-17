/**
 * Icon adapter — casts lucide-react icons to be compatible with
 * @types/react 18.x (project) when lucide-react ships types referencing
 * @types/react 19.x (root node_modules).
 *
 * This is a known dual-react issue in monorepos. The cast is safe because
 * lucide icons are standard SVG components.
 */
import React from 'react';
import {
  Shield,
  Import,
  AlertTriangle,
  Eye,
  EyeOff,
  CheckCircle2,
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  Settings,
  Lock,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  MessageCircle,
  Twitter,
  Globe,
  Zap,
  Key,
  Info,
  ExternalLink,
  Fingerprint,
  Delete,
  Copy,
  Check,
  Share2,
  ScanLine,
  Wallet,
  ShoppingCart,
  Search,
  X,
  RefreshCw,
  Clock,
  TrendingUp,
  TrendingDown,
  Link2,
  Plus,
} from 'lucide-react';

// Compatible icon type for both React 18 and 19
type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
  className?: string;
};
type IconFC = React.ComponentType<IconProps>;

const cast = (icon: unknown): IconFC => icon as IconFC;

export const IconShield = cast(Shield);
export const IconImport = cast(Import);
export const IconAlertTriangle = cast(AlertTriangle);
export const IconEye = cast(Eye);
export const IconEyeOff = cast(EyeOff);
export const IconCheckCircle2 = cast(CheckCircle2);
export const IconArrowLeft = cast(ArrowLeft);
export const IconChevronRight = cast(ChevronRight);
export const IconChevronDown = cast(ChevronDown);
export const IconSettings = cast(Settings);
export const IconLock = cast(Lock);
export const IconArrowUpRight = cast(ArrowUpRight);
export const IconArrowDownLeft = cast(ArrowDownLeft);
export const IconArrowLeftRight = cast(ArrowLeftRight);
export const IconMessageCircle = cast(MessageCircle);
export const IconTwitter = cast(Twitter);
export const IconGlobe = cast(Globe);
export const IconZap = cast(Zap);
export const IconKey = cast(Key);
export const IconInfo = cast(Info);
export const IconExternalLink = cast(ExternalLink);
export const IconFingerprint = cast(Fingerprint);
export const IconDelete = cast(Delete);
export const IconCopy = cast(Copy);
export const IconCheck = cast(Check);
export const IconShare2 = cast(Share2);
export const IconScanLine = cast(ScanLine);
export const IconWallet = cast(Wallet);
export const IconShoppingCart = cast(ShoppingCart);
export const IconSearch = cast(Search);
export const IconX = cast(X);
export const IconRefreshCw = cast(RefreshCw);
export const IconClock = cast(Clock);
export const IconTrendingUp = cast(TrendingUp);
export const IconTrendingDown = cast(TrendingDown);
export const IconLink2 = cast(Link2);
export const IconPlus = cast(Plus);
