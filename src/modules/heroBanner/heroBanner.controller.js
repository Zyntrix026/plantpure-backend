import { HeroBanner } from "./heroBanner.model.js";

export const addBanner = async (req, res) => {
  try {
    const { title, subtitle, category, priority } = req.body;
    const bannerImage = req.file ? req.file.path : req.body.bannerImage;

    const banner = await HeroBanner.create({
      title, subtitle, bannerImage, category, priority
    });

    res.status(201).json({ success: true, message: "Banner added!", banner });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};


export const getActiveBanners = async (req, res) => {
  try {
    // populate('category') se category ka slug aur name mil jayega navigate karne ke liye
    const banners = await HeroBanner.find({ status: 'Active' })
      .populate('category', 'name slug')
      .sort({ priority: 1 });

    res.status(200).json({ success: true, banners });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};


export const updateBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    if (req.file) updatedData.bannerImage = req.file.path;

    const banner = await HeroBanner.findByIdAndUpdate(id, updatedData, { new: true });
    res.status(200).json({ success: true, message: "Banner updated!", banner });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteBanner = async (req, res) => {
  try {
    await HeroBanner.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: "Banner deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getAllBannersForAdmin = async (req, res) => {
  try {
    
    const banners = await HeroBanner.find({})
      .populate('category', 'name slug') 
      .sort({ createdAt: -1 }); 

    res.status(200).json({ 
      success: true, 
      count: banners.length, 
      banners 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};