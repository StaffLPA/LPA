import { ReplitConnectors } from "@replit/connectors-sdk";

type InviteNotificationInput = {
  fullName: string;
  email: string | null;
  phone: string | null;
  role: string;
};

const connectors = new ReplitConnectors();
type InviteSender = (input: InviteNotificationInput) => Promise<void>;

function inviteMessage(input: InviteNotificationInput) {
  const ios = process.env.LPA_IOS_STORE_URL ?? "https://apps.apple.com";
  const android = process.env.LPA_ANDROID_STORE_URL ?? "https://play.google.com/store/apps";
  return [
    `Hi ${input.fullName},`,
    `Legendary Prep Academy invited you to join LPA as ${input.role}.`,
    `To complete your account, open LPA and select "Need to complete an invite?"`,
    `Use this exact email address: ${input.email ?? "the email address used for your invitation"}.`,
    `iPhone/iPad: ${ios}`,
    `Android: ${android}`,
  ].join("\n\n");
}

async function sendEmail(input: InviteNotificationInput, message: string) {
  if (!input.email) {
    throw new Error("Outlook invite delivery requires an email address.");
  }

  const response = await connectors.proxy("outlook", "/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: "You're invited to LPA",
        body: {
          contentType: "Text",
          content: message,
        },
        toRecipients: [
          {
            emailAddress: {
              address: input.email,
              name: input.fullName,
            },
          },
        ],
      },
      saveToSentItems: true,
    }),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Outlook email request failed (${response.status}): ${details.slice(0, 500)}`);
  }
}

async function sendOutlookInvite(input: InviteNotificationInput) {
  if (!input.email) {
    throw new Error("An email address is required to send an Outlook invite.");
  }
  const message = inviteMessage(input);
  await sendEmail(input, message);
}

let inviteSender: InviteSender = sendOutlookInvite;

export function setInviteNotificationSenderForTests(sender?: InviteSender) {
  inviteSender = sender ?? sendOutlookInvite;
}

/** Direct Outlook delivery; recipients use the exact email shown in the message. */
export async function sendInviteNotification(input: InviteNotificationInput) {
  await inviteSender(input);
}