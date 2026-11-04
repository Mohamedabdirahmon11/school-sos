# Administrator-owned WhatsApp absence messages

SchoolOS opens the administrator's existing WhatsApp account for absence notifications. No paid SMS/WhatsApp provider, Cloud API subscription, provider credentials, or automatic background sender is required. The administrator still needs internet access; normal mobile-data charges and WhatsApp's current terms and availability apply, so this is not a promise that WhatsApp will remain free forever.

## Setup

1. In **School Settings**, save the school's official telephone/administrator WhatsApp number in international format (for example, `+2519XXXXXXXX`).
2. Sign in to WhatsApp or WhatsApp Web with the administrator's own WhatsApp account on the same device/browser used for SchoolOS.
3. Make sure each student's parent/guardian phone number is saved in international format (starting with `+` or `00`).

The saved school number is the school's contact number shown in SchoolOS. It does not log in to WhatsApp or send messages by itself.

## Send an absence message

1. Open **Attendance**.
2. Mark the student as **Absent** and save attendance.
3. Use the WhatsApp action for that student.
4. SchoolOS opens the parent's WhatsApp chat and prepares a message containing the student's name, ID, date, class, and school.
5. The administrator checks the recipient and message, then presses **Send** in WhatsApp.

## Important behavior

- The administrator's currently signed-in WhatsApp account is the sender.
- SchoolOS does not send WhatsApp messages automatically.
- No paid messaging provider or messaging API is called.
- The administrator reviews and confirms every message inside WhatsApp.
- If the parent phone number is missing or invalid, update the student's parent/guardian contact before using the WhatsApp action.
