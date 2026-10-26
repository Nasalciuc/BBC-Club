export type EmailFacade = import("./types").EmailFacade;
export type OtpPurpose = import("./types").OtpPurpose;
export { postmarkSender, consoleSender, lastDevOtp, rememberDevOtp, POSTMARK_TIMEOUT_MS } from "../postmark";
