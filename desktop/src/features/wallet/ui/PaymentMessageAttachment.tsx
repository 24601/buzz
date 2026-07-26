import { ArrowUpRight } from "lucide-react";

import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/shared/ui/attachment";
import { WALLET_PROVIDER_NAME } from "../lib/walletStore";

type PaymentMessageAttachmentProps = {
  amountLabel: string;
  recipientName: string;
  memo: string;
};

// A sent payment rendered in the conversation timeline (marker format in
// paymentMessage.ts). Mirrors WaveMessageAttachment's card treatment.
export function PaymentMessageAttachment({
  amountLabel,
  recipientName,
  memo,
}: PaymentMessageAttachmentProps) {
  return (
    <Attachment
      className="mt-1 max-w-md"
      data-testid="message-payment-attachment"
      size="default"
    >
      <AttachmentMedia
        aria-hidden="true"
        className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      >
        <ArrowUpRight />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>
          Sent {amountLabel} to @{recipientName}
        </AttachmentTitle>
        <AttachmentDescription>
          {memo ? `${memo} · ` : ""}Paid over Lightning via{" "}
          {WALLET_PROVIDER_NAME}
        </AttachmentDescription>
      </AttachmentContent>
    </Attachment>
  );
}
