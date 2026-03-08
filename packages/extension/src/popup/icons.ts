/**
 * Icon wrapper components for extension popup screens.
 * Uses type erasure to avoid React type version conflicts between
 * the project's @types/react and lucide-react's bundled types.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import {
  Shield, Import, AlertTriangle, Eye, EyeOff, CheckCircle2,
  ArrowLeft, ChevronRight, Lock, KeyRound, Settings,
  ArrowUpRight, ArrowDownLeft, ArrowLeftRight, RefreshCw,
  Copy, Check, ExternalLink, Globe,
} from 'lucide-react';

function wrap(Icon: any) {
  return function WrappedIcon(props: Record<string, any>): React.ReactElement {
    return React.createElement(Icon as any, props);
  };
}

export const IconShield = wrap(Shield);
export const IconImport = wrap(Import);
export const IconAlertTriangle = wrap(AlertTriangle);
export const IconEye = wrap(Eye);
export const IconEyeOff = wrap(EyeOff);
export const IconCheckCircle2 = wrap(CheckCircle2);
export const IconArrowLeft = wrap(ArrowLeft);
export const IconChevronRight = wrap(ChevronRight);
export const IconLock = wrap(Lock);
export const IconKey = wrap(KeyRound);
export const IconSettings = wrap(Settings);
export const IconArrowUpRight = wrap(ArrowUpRight);
export const IconArrowDownLeft = wrap(ArrowDownLeft);
export const IconArrowLeftRight = wrap(ArrowLeftRight);
export const IconRefreshCw = wrap(RefreshCw);
export const IconCopy = wrap(Copy);
export const IconCheck = wrap(Check);
export const IconExternalLink = wrap(ExternalLink);
export const IconGlobe = wrap(Globe);
