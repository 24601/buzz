import * as React from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  Copy,
  Eye,
  EyeOff,
  QrCode,
  RefreshCw,
  Send,
} from "lucide-react";

import { cn } from "@/shared/lib/cn";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Separator } from "@/shared/ui/separator";
import { StyledQrCode } from "@/shared/ui/styled-qr-code";
import {
  formatBtc,
  MOCK_WALLET,
  type WalletTransaction,
} from "../lib/mockWallet";

// Wallet panel prototype per the Bitcoin-in-Buzz PRD MVP list: show the
// provider, show the balance prominently, fund via a BIP-321 QR, send to a
// BOLT12/BOLT11/offer string, transaction history, and a hidden-by-default
// seed-phrase reveal. Backed entirely by mock provider data — no funds move.

type WalletView = "overview" | "fund" | "send";

function TransactionRow({ tx }: { tx: WalletTransaction }) {
  const isReceive = tx.direction === "receive";
  return (
    <div
      className="flex items-center gap-3 py-2"
      data-testid={`wallet-tx-${tx.id}`}
    >
      <div
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full",
          isReceive
            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            : "bg-muted text-muted-foreground",
        )}
      >
        {isReceive ? (
          <ArrowDownLeft className="size-4" />
        ) : (
          <ArrowUpRight className="size-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{tx.counterparty}</p>
        <p className="truncate text-xs text-muted-foreground">{tx.memo}</p>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={cn(
            "text-sm font-semibold tabular-nums",
            isReceive
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-foreground",
          )}
        >
          {isReceive ? "+" : "−"}
          {formatBtc(tx.amountSats)}
        </p>
        <p className="text-xs text-muted-foreground">{tx.timeLabel}</p>
      </div>
    </div>
  );
}

function PanelHeader({
  onBack,
  title,
}: {
  onBack?: () => void;
  title: string;
}) {
  return (
    <div className="flex items-center gap-1">
      {onBack ? (
        <Button
          aria-label="Back to wallet overview"
          data-testid="wallet-panel-back"
          onClick={onBack}
          size="icon-xs"
          variant="ghost"
        >
          <ChevronLeft />
        </Button>
      ) : null}
      <h2 className="text-sm font-semibold">{title}</h2>
    </div>
  );
}

function OverviewView({
  onFund,
  onSend,
}: {
  onFund: () => void;
  onSend: () => void;
}) {
  const [seedRevealed, setSeedRevealed] = React.useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <PanelHeader title="Wallet" />
        <Badge data-testid="wallet-provider-badge" variant="outline">
          {MOCK_WALLET.providerName}
        </Badge>
      </div>

      <div className="flex flex-col items-center gap-1 py-2">
        <p
          className="text-3xl font-bold tabular-nums tracking-tight"
          data-testid="wallet-panel-balance"
        >
          {formatBtc(MOCK_WALLET.balanceSats)}
        </p>
        <p className="text-xs text-muted-foreground">
          Self-custodial · spans all your communities
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          data-testid="wallet-fund-button"
          onClick={onFund}
          variant="outline"
        >
          <QrCode className="size-4" />
          Fund
        </Button>
        <Button data-testid="wallet-send-button" onClick={onSend}>
          <Send className="size-4" />
          Send
        </Button>
      </div>

      <Separator />

      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recent activity
          </h3>
        </div>
        <div
          className="max-h-64 divide-y divide-border/40 overflow-y-auto"
          data-testid="wallet-tx-history"
        >
          {MOCK_WALLET.transactions.map((tx) => (
            <TransactionRow key={tx.id} tx={tx} />
          ))}
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recovery phrase
          </h3>
          <Button
            data-testid="wallet-seed-toggle"
            onClick={() => setSeedRevealed((v) => !v)}
            size="xs"
            variant="ghost"
          >
            {seedRevealed ? (
              <EyeOff className="size-3.5" />
            ) : (
              <Eye className="size-3.5" />
            )}
            {seedRevealed ? "Hide" : "Reveal"}
          </Button>
        </div>
        {seedRevealed ? (
          <p
            className="rounded-lg border border-border/60 bg-muted/40 p-3 font-mono text-xs leading-relaxed"
            data-testid="wallet-seed-phrase"
          >
            {MOCK_WALLET.seedPhrase}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Hidden. Anyone with these 12 words can spend your bitcoin.
          </p>
        )}
      </div>
    </div>
  );
}

function FundView({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <PanelHeader onBack={onBack} title="Fund wallet" />
      <div className="mx-auto rounded-lg border border-border/70 bg-white p-3">
        <StyledQrCode
          data-testid="wallet-fund-qr"
          size={208}
          title="Fund wallet QR code"
          value={MOCK_WALLET.bip321Uri}
        />
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Scan with any Lightning wallet. Encodes a reusable BOLT12 offer with a
        BOLT11 fallback (BIP-321).
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button
          data-testid="wallet-copy-offer"
          onClick={() => {
            void navigator.clipboard.writeText(MOCK_WALLET.bolt12Offer);
          }}
          variant="outline"
        >
          <Copy className="size-4" />
          Copy offer
        </Button>
        <Button data-testid="wallet-refresh-offer" variant="outline">
          <RefreshCw className="size-4" />
          Refresh offer
        </Button>
      </div>
    </div>
  );
}

function SendView({ onBack }: { onBack: () => void }) {
  const [destination, setDestination] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const canSend = destination.trim().length > 0 && amount.trim().length > 0;

  return (
    <div className="flex flex-col gap-4">
      <PanelHeader onBack={onBack} title="Send bitcoin" />
      <div className="flex flex-col gap-2">
        <label
          className="text-xs font-medium text-muted-foreground"
          htmlFor="wallet-send-destination"
        >
          To — BOLT12 offer or BOLT11 invoice
        </label>
        <Input
          data-testid="wallet-send-destination"
          id="wallet-send-destination"
          onChange={(event) => setDestination(event.target.value)}
          placeholder="lno1… or lnbc1…"
          value={destination}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label
          className="text-xs font-medium text-muted-foreground"
          htmlFor="wallet-send-amount"
        >
          Amount (₿)
        </label>
        <Input
          data-testid="wallet-send-amount"
          id="wallet-send-amount"
          inputMode="numeric"
          onChange={(event) => setAmount(event.target.value)}
          placeholder="100"
          value={amount}
        />
      </div>
      <Button data-testid="wallet-send-confirm" disabled={!canSend}>
        <Send className="size-4" />
        Send
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Prototype — no funds move.
      </p>
    </div>
  );
}

export function WalletPanel() {
  const [view, setView] = React.useState<WalletView>("overview");
  const backToOverview = React.useCallback(() => setView("overview"), []);

  return (
    <div data-testid="wallet-panel">
      {view === "overview" ? (
        <OverviewView
          onFund={() => setView("fund")}
          onSend={() => setView("send")}
        />
      ) : view === "fund" ? (
        <FundView onBack={backToOverview} />
      ) : (
        <SendView onBack={backToOverview} />
      )}
    </div>
  );
}
