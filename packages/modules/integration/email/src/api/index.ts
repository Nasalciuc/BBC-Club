export type EmailFacade = import("./types").EmailFacade;
export type OtpPurpose = import("./types").OtpPurpose;
export { postmarkSender, consoleSender, lastDevOtp, rememberDevOtp } from "../postmark";
