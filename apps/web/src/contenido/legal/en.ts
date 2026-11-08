// Privacy policy and terms of use in English (task 2.8).
// DRAFT pending review by an adviser (task 2.9). The Spanish version prevails.
// Markdown: `TextoLegal` turns it into HTML.

export const privacidad = `
**Draft pending legal review.** This text is not final yet. In case of doubt, the Spanish version prevails.

This policy explains what personal data Inquilinus processes, why, for how long and what your rights are. We try to keep as little as possible and to explain it clearly.

## 1. Who is the controller

- **Controller:** [pending: full name or company name]
- **Tax ID (NIF):** [pending: NIF]
- **Address:** [pending: postal address]
- **Privacy contact:** [pending: contact email]

## 2. What data we process and why

### Your account

- **Email**, to identify you, send you account messages (confirmation, password recovery, sign-in codes) and reply to you.
- **Name**, if you choose to give it.
- **Password**, stored only as an encrypted digest (hash): nobody, not even us, can read it.
- **How you sign in**: with email and password or with Google. If you use Google we only receive your email and name; we don't keep your photo.
- **Acceptance of this policy and the terms**: which version you accepted and when.
- **Two-step verification**, if you turn it on: your authenticator app key and recovery codes, stored encrypted.
- **Preferences**: language and appearance of the app.

### Account security

- **Open sessions**: date, IP address and browser of each session, so you can close them and so we can spot unusual access.
- **Failed sign-in attempts**: to block attempts for 15 minutes after 5 failures. They are stored as an encrypted fingerprint of the email and IP that doesn't reveal what they are.
- **Technical logs** about how the service runs, which contain no personal data.

### Your properties' and tenants' data

To manage your rentals you enter data about your tenants: their name, the dates of their stay, payments, utility bills, the contract and the deposit receipt. We don't ask for or keep your tenants' ID documents, payslips, phone numbers or emails.

**For that data you are the controller**, and Inquilinus processes it on your behalf, only to provide the service, as a **processor**. The terms of that processing are in [pending: data processing agreement (task 7.4)] ⚖️. You must tell your tenants that you use Inquilinus to manage their data.

### Reading bills with artificial intelligence

When you upload a utility bill, we send **only that bill's PDF** and the names of your expense types to an artificial intelligence model (Claude, by Anthropic, through Amazon Bedrock in the European Union) to suggest the period, amount and expense type. You always review the suggestion before it's used. The provider **does not use your bills to train** its models. Contracts and deposit receipts are **never** sent to the artificial intelligence.

### Payments (when paid plans are available)

Subscription payments are handled by **Paddle** as merchant of record: Paddle charges you, issues the invoice and processes your payment data as an independent controller, under its own privacy policy. Inquilinus never sees or stores your card details; it only receives your customer and subscription identifiers and their status.

## 3. Why we can process it (legal basis) ⚖️

- **Contract:** to create and keep your account and provide the service you ask for.
- **Legitimate interest:** to protect your account and the service against unauthorised access and abuse (sessions, failed attempts, technical logs).
- **Legal obligation:** to meet tax and accounting obligations when there are payments.

We don't use your data for advertising and we don't sell it.

## 4. How long we keep it ⚖️

- **While you have an account.** If you delete it, all its data is removed at that moment, including your properties' and tenants' data and their files.
- **Backups:** our database provider keeps backups for a limited time; deleted data disappears from them as they roll over [pending: backup retention period] ⚖️.
- **Sessions:** 30 days at most.
- **Billing data** (when there are payments): as long as tax law requires.

## 5. Who we share it with

Only with the providers we need in order to run, under contracts that require them to protect the data and use it solely to provide their service to us:

| Provider | Purpose | Where the data is |
| --- | --- | --- |
| Vercel | Serving the website and the API | European Union (Frankfurt) |
| Neon | Database | European Union (Frankfurt) |
| Amazon Web Services | Files, sending emails and artificial intelligence | European Union (Stockholm and EU regions) |
| Google | Sign in with Google, if you choose it | According to your Google account |
| Paddle | Charging subscriptions, when available | According to its privacy policy |

Vercel, Neon and Amazon are US companies, but your data is hosted in the European Union. Any access from outside the EU is covered by the safeguards of the General Data Protection Regulation (standard contractual clauses or the EU-US Data Privacy Framework) ⚖️.

We don't share your data with anyone else unless required by law.

## 6. Your rights

You can **access** your data, **correct** it, **erase** it, **object** to its processing, ask us to **restrict** it and take it to another service (**portability**).

- From **Settings → Your data** you can download all your data and delete your account at any time.
- For anything else, write to [pending: contact email].
- If you think we haven't handled your rights properly, you can complain to the **Spanish Data Protection Agency** (www.aepd.es).

If you are the tenant of a landlord who uses Inquilinus, please contact them first: they are the controller of your data.

## 7. How we protect it

Encrypted connections, data encrypted at rest, files in private storage that can only be reached through temporary links after checking permissions, each account isolated from the others, two-step verification available and technical logs without personal data.

## 8. Cookies

We only use **technical cookies**, needed for the app to work, so they don't require your consent:

- **Session** (\`inquilinus.session_token\` and related): keeping you signed in.
- **Two-step verification and Google sign-in**: temporary cookies during sign-in.
- **Preferences** (\`idioma\`, \`tema\`): remembering your language and appearance.

We don't use analytics or advertising cookies. If we ever did, we would ask for your permission first.

## 9. Age

Inquilinus is meant for adult landlords. It is not intended for anyone under 18.

## 10. Changes to this policy

If we change it in an important way, we'll let you know in the app or by email before it applies. Each version is dated.
`;

export const terminos = `
**Draft pending legal review.** This text is not final yet. In case of doubt, the Spanish version prevails.

These terms govern the use of Inquilinus. By creating your account you accept them. We've written them to be understood; if anything is unclear, write to us.

## 1. Who provides the service

Inquilinus is provided by [pending: full name or company name], tax ID (NIF) [pending: NIF], with address at [pending: postal address]. Contact: [pending: contact email].

## 2. What Inquilinus is

A web application for landlords to manage their rentals: properties, rooms, tenants, rent payments, utility bills and how they are split among tenants, and a link for each tenant to see their breakdown.

## 3. Your account

- You must be an adult and use an email address that is yours.
- The account is personal: one person per account.
- You are responsible for keeping your password safe. We recommend turning on two-step verification.
- If you think someone has got into your account, change your password and sign out everywhere from **Settings**.

## 4. Acceptable use

- Use Inquilinus for properties you own or legitimately manage.
- Your tenants' data must be lawful and necessary. **You are the controller of that data** and must tell your tenants that you manage it with Inquilinus ⚖️.
- Don't upload ID documents, payslips or data that isn't needed.
- Don't try to access other accounts' data, get around the service's limits or harm how it works.

## 5. Your data is yours

Everything you enter remains yours. We only use it to provide the service, as explained in the **privacy policy**. You can download and delete it whenever you want from **Settings → Your data**.

## 6. Artificial intelligence and calculations

- Reading bills with artificial intelligence **suggests** the period, amount and expense type. **You always review and confirm** before it's used. It can make mistakes.
- Splits and payments are calculated with the rules explained in the app. They are an aid: check the amounts before charging them.
- Inquilinus does not provide legal or tax advice.

## 7. The tenant link

You decide who you share each tenant's link with and you can revoke it at any time. Each link only shows what belongs to that stay.

## 8. Plans and prices

- **Starter:** free. One property and 2 bills read with artificial intelligence per month.
- **Advanced:** €4.99 per month or €49.90 per year, VAT included. Up to 10 properties and bill reading with no practical limit.
- Payments are handled by **Paddle** as merchant of record, under its own terms of sale. Paddle issues your invoice.
- You can cancel whenever you want: the plan stays active until the end of the paid period and then moves to Starter. **Nothing is deleted**: if you have more than one property, you choose which one stays active and the others are locked until you return to Advanced.
- If we change prices, we'll tell you at least 30 days in advance and you can cancel before the change applies.
- Right of withdrawal and refunds: [pending: terms under consumer law and Paddle's terms] ⚖️.

Paid plans will be available later on; until then, Inquilinus is free.

## 9. Availability

We work to keep Inquilinus running and your data safe, but there may be interruptions for maintenance or failures. We recommend downloading your data from time to time.

## 10. Liability ⚖️

We are liable for damage we cause by not complying with these terms, as provided by law. We are not liable for how you use the calculations or for the data you enter. Nothing here limits your statutory rights as a consumer.

## 11. Closing and suspending accounts

- You can delete your account at any time from **Settings → Your data**.
- We may suspend or close an account that seriously breaches these terms, letting you know beforehand unless that isn't possible.

## 12. Changes to the terms

If we change them in an important way, we'll tell you in advance in the app or by email and ask you to accept the new version. Each version is dated.

## 13. Governing law

These terms are governed by Spanish law. If you are a consumer, you can go to the courts of your place of residence ⚖️.
`;
