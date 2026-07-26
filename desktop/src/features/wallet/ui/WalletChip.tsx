import { Copy, Zap } from "lucide-react";

import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { StyledQrCode } from "@/shared/ui/styled-qr-code";
import { formatUsd } from "../lib/paymentIntent";
import {
  useWalletBalanceCents,
  WALLET_BIP321_URI,
  WALLET_PROVIDER_NAME,
} from "../lib/walletStore";

// Conversation-first wallet: the chrome affordance is ONLY a balance and a
// way to fund it. Sending money happens in the conversation itself — type a
// `$`-prefixed amount with an @recipient and confirm (see
// useWalletPaymentGate). No panel, no send form, no history view.
//
// Fixed height on purpose: this chip lives in the top chrome beside the
// px-pinned nav buttons (see `AppTopChrome`), so it follows the same
// deliberate exception to the rem-first rule.
export function WalletChip() {
  const balanceCents = useWalletBalanceCents();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={`Wallet balance ${formatUsd(balanceCents)}`}
          className="flex h-[28px] items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-3 text-xs font-semibold tabular-nums text-sidebar-foreground/90 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          data-testid="wallet-chip"
          type="button"
        >
          <Zap className="size-3.5 text-amber-500" />
          {formatUsd(balanceCents)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80" sideOffset={8}>
        <div className="flex flex-col gap-4" data-testid="wallet-fund-panel">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Wallet</h2>
            <Badge data-testid="wallet-provider-badge" variant="outline">
              {WALLET_PROVIDER_NAME}
            </Badge>
          </div>
          <div className="flex flex-col items-center gap-1">
            <p
              className="text-3xl font-bold tabular-nums tracking-tight"
              data-testid="wallet-chip-balance"
            >
              {formatUsd(balanceCents)}
            </p>
            <p className="text-xs text-muted-foreground">
              Self-custodial · spans all your communities
            </p>
          </div>
          <div className="mx-auto rounded-lg border border-border/70 bg-white p-3">
            <StyledQrCode
              data-testid="wallet-fund-qr"
              size={176}
              title="Fund wallet QR code"
              value={WALLET_BIP321_URI}
            />
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Scan with any Lightning wallet to add funds (BIP-321).
          </p>
          <Button
            data-testid="wallet-copy-offer"
            onClick={() => {
              void navigator.clipboard.writeText(WALLET_BIP321_URI);
            }}
            variant="outline"
          >
            <Copy className="size-4" />
            Copy funding link
          </Button>
          <p className="rounded-lg border border-border/60 bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            To pay someone, just say it in the conversation — e.g.{" "}
            <span className="font-mono text-foreground">$20 @Mat lunch</span>.
            You&apos;ll confirm before anything is sent.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
