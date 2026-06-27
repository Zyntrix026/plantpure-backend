import Campaign from "./campain.model.js";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.FROM_EMAIL || "onboarding@resend.dev";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

// Resend batch API hard limit per call
const BATCH_CHUNK_SIZE = 100;

// RFC 5322 simplified regex — far stricter than just includes('@')
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const parseEmails = (text) => [
  ...new Set(
    text
      .split(/[\n,;]+/) // support newline, comma, semicolon separators
      .map((e) => e.trim().toLowerCase())
      .filter((e) => EMAIL_REGEX.test(e)),
  ),
];

const buildEmailHtml = (subject, content) => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${subject}</title>
    <!--[if mso]>
    <noscript>
      <xml>
        <o:OfficeDocumentSettings>
          <o:PixelsPerInch>96</o:PixelsPerInch>
        </o:OfficeDocumentSettings>
      </xml>
    </noscript>
    <![endif]-->
    <style>
      /* Mobile & Responsiveness Styles */
      @media screen and (max-width: 600px) {
        .email-container {
          width: 100% !important;
          margin: auto !important;
        }
        .fluid {
          max-width: 100% !important;
          height: auto !important;
          margin-left: auto !important;
          margin-right: auto !important;
        }
        .stack-column {
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
          direction: ltr !important;
        }
        .padded-cell {
          padding: 20px !important;
        }
      }
    </style>
  </head>
  <body style="margin:0; padding:0 !important; mso-line-height-rule:exactly; background-color:#F8FAFC; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <center style="width:100%; background-color:#F8FAFC;">
      <!--[if mso | IE]>
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" align="center" style="background-color:#F8FAFC;">
      <tr>
      <td>
      <![endif]-->
      
      <div style="max-width:600px; margin:0 auto;" class="email-container">
        <!-- Main Wrapper Table -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:auto; background-color:#FFFFFF; border:1px solid #E2E8F0; border-radius:16px; overflow:hidden;">
          
          <!-- HEADER WITH LOGO -->
          <tr>
            <td style="background-color:#1E3A8A; padding:32px 24px; text-align:center;">
              <a href="https://www.sidtelfers.co.uk/" target="_blank" style="text-decoration:none; display:inline-block;">
                <img src="https://www.sidtelfers.co.uk/assets/logo-BDR9BOZA.png" width="180" alt="Sid Telfers DIY & Timber" border="0" style="width:180px; max-width:100%; height:auto; display:block; margin:0 auto;" class="fluid" />
              </a>
              <p style="color:#93C5FD; margin:12px 0 0 0; font-size:13px; font-weight:500; letter-spacing:0.5px; font-family:inherit;">
                Milton Keynes, United Kingdom
              </p>
            </td>
          </tr>

          <!-- MAIN CONTENT BODY -->
          <tr>
            <td class="padded-cell" style="padding:40px 32px; font-size:15px; color:#334155; line-height:1.7; font-family:inherit;">
              ${content}
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td class="padded-cell" style="padding:24px 32px; background-color:#F8FAFC; border-top:1px solid #E2E8F0; text-align:center; font-family:inherit;">
              <p style="margin:0; font-size:14px; font-weight:700; color:#101828;">
                <a href="https://www.sidtelfers.co.uk/" target="_blank" style="color:#101828; text-decoration:none;">Sid Telfers DIY & Timber</a>
              </p>
              <p style="margin:8px 0 0 0; font-size:12px; color:#64748B; line-height:1.5;">
                You are receiving this because you subscribed to our newsletter.
                <br style="display:none;" class="stack-column" />
                <span style="color:#CBD5E1; margin:0 8px;" class="stack-column">—</span>
                <a href="tel:01908312359" style="color:#1E3A8A; text-decoration:none; font-weight:500;">(01908) 312359</a>
              </p>
            </td>
          </tr>

        </table>
      </div>

      <!--[if mso | IE]>
      </td>
      </tr>
      </table>
      <![endif]-->
    </center>
  </body>
</html>`;

/**
 * Sends emails in chunks of BATCH_CHUNK_SIZE to respect Resend's 100/batch limit.
 * Returns { successCount, failCount }
 */
const sendInChunks = async (emails, subject, html) => {
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < emails.length; i += BATCH_CHUNK_SIZE) {
    const chunk = emails.slice(i, i + BATCH_CHUNK_SIZE);
    const payload = chunk.map((email) => ({
      from: FROM_EMAIL,
      to: [email],
      subject,
      html,
    }));

    try {
      const response = await resend.batch.send(payload);
      if (response.error) {
        console.error(
          `Batch chunk ${i / BATCH_CHUNK_SIZE + 1} error:`,
          response.error,
        );
        failCount += chunk.length;
      } else {
        successCount += chunk.length;
      }
    } catch (err) {
      console.error(
        `Batch chunk ${i / BATCH_CHUNK_SIZE + 1} threw:`,
        err.message,
      );
      failCount += chunk.length;
    }

    // Small delay between chunks to avoid rate-limit spikes (50ms is safe)
    if (i + BATCH_CHUNK_SIZE < emails.length) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  return { successCount, failCount };
};

// ─── 1. Get All Campaigns ─────────────────────────────────────────────────────
export const getAllCampaigns = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const [campaigns, total] = await Promise.all([
      Campaign.find()
        .select("-emailContent -recipients") // don't send heavy fields in list
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Campaign.countDocuments(),
    ]);

    return res.status(200).json({
      success: true,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: campaigns,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch campaigns.",
      error: error.message,
    });
  }
};

// ─── 2. Get Single Campaign ───────────────────────────────────────────────────
export const getCampaignById = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id).lean();
    if (!campaign)
      return res
        .status(404)
        .json({ success: false, message: "Campaign not found." });
    return res.status(200).json({ success: true, data: campaign });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch campaign.",
      error: error.message,
    });
  }
};

// ─── 3. Send Bulk Campaign ────────────────────────────────────────────────────
export const sendBulkCampaign = async (req, res) => {
  try {
    const { name, subject, emailContent, recipientsText } = req.body;

    if (
      !name?.trim() ||
      !subject?.trim() ||
      !emailContent?.trim() ||
      !recipientsText?.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "All fields are required: Campaign Name, Subject, Email Content, and Recipients.",
      });
    }

    const validEmails = parseEmails(recipientsText);

    if (validEmails.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "No valid email addresses found. Make sure emails are in correct format (one per line).",
      });
    }

    if (validEmails.length > 10000) {
      return res.status(400).json({
        success: false,
        message:
          "Recipient limit exceeded. Maximum 10,000 emails per campaign.",
      });
    }

    const html = buildEmailHtml(subject.trim(), emailContent.trim());
    const { successCount, failCount } = await sendInChunks(
      validEmails,
      subject.trim(),
      html,
    );

    const campaign = new Campaign({
      name: name.trim(),
      subject: subject.trim(),
      emailContent: emailContent.trim(),
      recipients: validEmails,
      recipientCount: validEmails.length,
      status: failCount === validEmails.length ? "Failed" : "Sent",
      sentAt: new Date(),
      successCount,
      failCount,
    });
    await campaign.save();

    return res.status(201).json({
      success: true,
      message: `Campaign dispatched. ${successCount} sent, ${failCount} failed out of ${validEmails.length} recipients.`,
      data: campaign,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Campaign dispatch failed.",
      error: error.message,
    });
  }
};

// ─── 4. Save Draft ────────────────────────────────────────────────────────────
export const saveCampaignDraft = async (req, res) => {
  try {
    const { name, subject, emailContent, recipientsText } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Campaign name is required to save a draft.",
      });
    }

    const recipients = recipientsText?.trim()
      ? parseEmails(recipientsText)
      : [];

    const draft = new Campaign({
      name: name.trim(),
      subject: subject?.trim() || "",
      emailContent: emailContent || "",
      recipients,
      recipientCount: recipients.length,
      status: "Draft",
    });
    await draft.save();

    return res.status(201).json({
      success: true,
      message: "Draft saved successfully.",
      data: draft,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to save draft.",
      error: error.message,
    });
  }
};

// ─── 5. Update Draft ─────────────────────────────────────────────────────────
export const updateCampaignDraft = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign)
      return res
        .status(404)
        .json({ success: false, message: "Campaign not found." });
    if (campaign.status === "Sent") {
      return res.status(400).json({
        success: false,
        message: "Cannot edit a campaign that has already been sent.",
      });
    }

    const { name, subject, emailContent, recipientsText } = req.body;

    if (name) campaign.name = name.trim();
    if (subject) campaign.subject = subject.trim();
    if (emailContent) campaign.emailContent = emailContent;
    if (recipientsText !== undefined) {
      campaign.recipients = recipientsText?.trim()
        ? parseEmails(recipientsText)
        : [];
      campaign.recipientCount = campaign.recipients.length;
    }

    await campaign.save();
    return res
      .status(200)
      .json({ success: true, message: "Campaign updated.", data: campaign });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update campaign.",
      error: error.message,
    });
  }
};

// ─── 6. Send Test Email ───────────────────────────────────────────────────────
export const sendTestEmail = async (req, res) => {
  try {
    const { subject, emailContent, testEmail } = req.body;

    if (!subject?.trim() || !emailContent?.trim() || !testEmail?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Subject, content, and test email address are required.",
      });
    }

    if (!EMAIL_REGEX.test(testEmail.trim())) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid test email address." });
    }

    const html = buildEmailHtml(subject.trim(), emailContent.trim());

    await resend.emails.send({
      from: FROM_EMAIL,
      to: [testEmail.trim()],
      subject: `[TEST] ${subject.trim()}`,
      html,
    });

    return res.status(200).json({
      success: true,
      message: `Test email sent to ${testEmail.trim()}.`,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to send test email.",
      error: error.message,
    });
  }
};

// ─── 7. Delete Campaign ───────────────────────────────────────────────────────
export const deleteCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findByIdAndDelete(req.params.id);
    if (!campaign)
      return res
        .status(404)
        .json({ success: false, message: "Campaign not found." });
    return res
      .status(200)
      .json({ success: true, message: "Campaign deleted successfully." });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete campaign.",
      error: error.message,
    });
  }
};

// ─── 8. Campaign Stats ────────────────────────────────────────────────────────
export const getCampaignStats = async (req, res) => {
  try {
    const [total, sent, draft, failed, emailsSentAgg] = await Promise.all([
      Campaign.countDocuments(),
      Campaign.countDocuments({ status: "Sent" }),
      Campaign.countDocuments({ status: "Draft" }),
      Campaign.countDocuments({ status: "Failed" }),
      Campaign.aggregate([
        { $match: { status: "Sent" } },
        { $group: { _id: null, totalSent: { $sum: "$successCount" } } },
      ]),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalCampaigns: total,
        sentCampaigns: sent,
        draftCampaigns: draft,
        failedCampaigns: failed,
        totalEmailsSent: emailsSentAgg[0]?.totalSent || 0,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch stats.",
      error: error.message,
    });
  }
};
