import * as React from "react";
import { ArrowUpRight } from "lucide-react";

import { useFeatureEnabled } from "@/shared/features";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import { formatUsd, parsePaymentIntent } from "../lib/paymentIntent";
import { buildPaymentMessageContent } from "../lib/paymentMessage";
import {
  spendFromWallet,
  useWalletBalanceCents,
  WALLET_PROVIDER_NAME,
} from "../lib/walletStore";

// Conversational payment gate: wraps the composer's onSend. When an outgoing
// message carries a payment intent ("$20 @Mat lunch"), the send pauses on an
// explicit confirmation dialog. Confirm → the message is rewritten into the
// payment format (see paymentMessage.ts), the session balance deducts, and
// the send proceeds with mentions intact so the recipient is notified.
// Cancel → the promise rejects, which the composer's existing catch path
// turns into a draft restore: nothing sends, nothing is lost.

type SendFn = (
  content: string,
  mentionPubkeys: string[],
  mediaTags?: string[][],
  channelId?: string | null,
  threadContext?: {
    parentEventId: string | null;
    threadHeadId: string | null;
  } | null,
) => Promise<void>;

type PendingPayment = {
  amountCents: number;
  recipientName: string;
  memo: string;
  args: Parameters<SendFn>;
  resolve: () => void;
  reject: (reason: Error) => void;
};

export function useWalletPaymentGate(onSend: SendFn): {
  gatedOnSend: SendFn;
  paymentConfirmDialog: React.ReactNode;
} {
  const walletEnabled = useFeatureEnabled("wallet");
  const balanceCents = useWalletBalanceCents();
  const [pending, setPending] = React.useState<PendingPayment | null>(null);

  const onSendRef = React.useRef(onSend);
  onSendRef.current = onSend;

  const gatedOnSend = React.useCallback<SendFn>(
    (...args) => {
      const intent = walletEnabled ? parsePaymentIntent(args[0]) : null;
      if (!intent) {
        return onSendRef.current(...args);
      }
      return new Promise<void>((resolve, reject) => {
        setPending({ ...intent, args, resolve, reject });
      });
    },
    [walletEnabled],
  );

  const cancelPayment = React.useCallback(() => {
    setPending((current) => {
      current?.reject(new Error("Payment cancelled"));
      return null;
    });
  }, []);

  const confirmPayment = React.useCallback(() => {
    setPending((current) => {
      if (!current) {
        return null;
      }
      const [, mentionPubkeys, mediaTags, channelId, threadContext] =
        current.args;
      const paymentContent = buildPaymentMessageContent(
        current.amountCents,
        current.recipientName,
        current.memo,
      );
      spendFromWallet(current.amountCents);
      onSendRef
        .current(
          paymentContent,
          mentionPubkeys,
          mediaTags,
          channelId,
          threadContext,
        )
        .then(current.resolve, current.reject);
      return null;
    });
  }, []);

  const insufficient = pending !== null && pending.amountCents > balanceCents;

  const paymentConfirmDialog = (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open) cancelPayment();
      }}
      open={pending !== null}
    >
      <AlertDialogContent data-testid="payment-confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Send {pending ? formatUsd(pending.amountCents) : ""} to @
            {pending?.recipientName}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pending?.memo ? (
              <>
                For{" "}
                <span className="font-medium text-foreground">
                  {pending.memo}
                </span>
                .{" "}
              </>
            ) : null}
            Paid instantly over Lightning via {WALLET_PROVIDER_NAME}. This
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div
          className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm"
          data-testid="payment-confirm-balance"
        >
          <span className="text-muted-foreground">Balance after sending</span>
          <span
            className={
              insufficient
                ? "font-semibold text-destructive"
                : "font-semibold tabular-nums"
            }
          >
            {insufficient
              ? "Insufficient funds"
              : formatUsd(balanceCents - (pending?.amountCents ?? 0))}
          </span>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel
            data-testid="payment-cancel"
            onClick={cancelPayment}
          >
            Cancel
          </AlertDialogCancel>
          <Button
            data-testid="payment-confirm"
            disabled={insufficient}
            onClick={confirmPayment}
          >
            <ArrowUpRight className="size-4" />
            Send {pending ? formatUsd(pending.amountCents) : ""}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { gatedOnSend, paymentConfirmDialog };
}
