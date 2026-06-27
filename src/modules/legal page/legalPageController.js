import LegalPage from "./LegalPage.js"; // Note: .js extension zaroori hai

const updatePageData = async (pageKey, title, req, res) => {
  try {
    const { content, metaTitle, metaDescription, status } = req.body;

    if (!content) {
      return res
        .status(400)
        .json({ success: false, message: "Content is required" });
    }

    const updatedPage = await LegalPage.findOneAndUpdate(
      { pageKey },
      {
        pageKey,
        title,
        content,
        metaTitle,
        metaDescription,
        status: status || "Published",
      },
      { new: true, upsert: true, runValidators: true },
    );

    return res.status(200).json({
      success: true,
      message: `${title} updated successfully!`,
      data: updatedPage,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Named exports for dedicated route calls
export const updatePrivacyPolicy = (req, res) =>
  updatePageData("privacy", "Privacy Policy", req, res);
export const updateRefundPolicy = (req, res) =>
  updatePageData("refund", "Refund Policy", req, res);
export const updateTermsConditions = (req, res) =>
  updatePageData("terms", "Terms & Conditions", req, res);

// Public controller for Frontend Storefront Fetch
export const getPageContent = async (req, res) => {
  try {
    const { pageKey } = req.params;

    const page = await LegalPage.findOne({ pageKey });
    if (!page) {
      return res
        .status(404)
        .json({ success: false, message: "Page not found" });
    }

    return res.status(200).json({ success: true, data: page });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
