import { Zap } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { formatBtc, MOCK_WALLET } from "../lib/mockWallet";
import { WalletPanel } from "./WalletPanel";

// Top-right wallet affordance: the user's global bitcoin balance, always
// visible in the app chrome ("running score" per the PRD's top-level balance
// discussion). Clicking it opens the wallet panel in a popover.
//
// Fixed height on purpose: this chip lives in the top chrome beside the
// px-pinned nav buttons (see `AppTopChrome`), so it follows the same
// deliberate exception to the rem-first rule.
export function WalletBalanceChip() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={`Wallet balance ${formatBtc(MOCK_WALLET.balanceSats)}`}
          className="flex h-[28px] items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-3 text-xs font-semibold tabular-nums text-sidebar-foreground/90 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          data-testid="wallet-balance-chip"
          type="button"
        >
          <Zap className="size-3.5 text-amber-500" />
          {formatBtc(MOCK_WALLET.balanceSats)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-88" sideOffset={8}>
        <WalletPanel />
      </PopoverContent>
    </Popover>
  );
}
