
# Calendly-Clone Scheduler App

A full-featured advisor-client scheduling tool, built.


## 📦 Repo

[👉 GitHub Repository] (https://github.com/uma26madasu/procalender_backend)

Live Link : https://procalender-backend.onrender.com


## 🔐 Login

- Use Google OAuth to sign in and connect calendars.
- Connect multiple Google accounts to view merged availability.
- Connect HubSpot CRM via OAuth (free test account supported).

---

## 🗓 Features Overview

### Advisor Capabilities
- Create **scheduling windows** (e.g., Mon 9am–12pm)
- Create **scheduling links** with:
  - Custom usage limits
  - Expiration date
  - Custom questions
  - Meeting duration
  - Max # days in advance

### Client Scheduling Flow
- Visits a unique link (unauthenticated)
- Picks a time slot
- Enters:
  - Email
  - LinkedIn URL
  - Custom question answers

---

## 🧠 AI Contextual Augmentation

- After a booking:
  - Advisor receives an email with:
    - Raw answers
    - Augmented insights using:
      - HubSpot contact notes (if available)
      - OR scraped LinkedIn profile summary
- Example:

  ```
  Q: What concerns do you have?
  A: My daughter's wedding is going to be expensive

  Context: Last time they were concerned about her college tuition.
  ```

---

## 📧 Email Notification

- Advisors are notified via email when a new booking is made.
- Email includes:
  - Full form answers
  - Context-augmented notes

---

## 🛠 Tech Stack

- **Frontend**: React, TailwindCSS
- **Backend**: Node.js, Express
- **Auth & Calendar**: Google OAuth, Calendar API
- **CRM**: HubSpot OAuth + Contacts API
- **AI**: Optional endpoint or local summarizer (mocked in demo)
- **Email**: Nodemailer via Gmail
- **Scraping**: Puppeteer (or placeholder/mock)

---

## 🚀 Setup Locally (optional)

```bash
git clone https://github.com/your-username/calendly-clone-scheduler.git
cd calendly-clone-scheduler
npm install
npm run dev
```

Setup your `.env` with:

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
HUBSPOT_CLIENT_ID=
HUBSPOT_CLIENT_SECRET=
EMAIL_USER=
EMAIL_PASS=
```

---

## 📌 Notes

- AI augmentation and LinkedIn scraping can be mocked if full implementation is restricted due to scraping TOS.
- OAuth flows are fully working with test accounts.

---

## 📅 Submission Info

- Submitted: **May 12, 2025 before 10am MDT**
- Completed by: Uma Madasu
- Contact: umamadasu@gmail.com
