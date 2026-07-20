// Extract ImageKit URLs from HTML content
export const extractImageKitUrls = (htmlContent) => {
  if (!htmlContent) return [];
  
  const imageRegex = /<img[^>]+src="([^"]*imagekit[^"]*)"[^>]*>/gi;
  const urls = [];
  let match;
  
  while ((match = imageRegex.exec(htmlContent)) !== null) {
    urls.push(match[1]);
  }
  
  return urls;
};

// Extract fileIds from ImageKit URLs
export const extractFileIdsFromUrls = (urls) => {
  return urls.map(url => {
    // Extract fileId from ImageKit URL pattern
    const match = url.match(/\/([^\/]+)$/);
    return match ? match[1].split('?')[0] : null;
  }).filter(Boolean);
};

// Extract all ImageKit fileIds from blog content
export const extractContentImageIds = (htmlContent) => {
  const urls = extractImageKitUrls(htmlContent);
  return extractFileIdsFromUrls(urls);
};

// Clean up unused images when blog is updated
export const cleanupUnusedImages = async (oldContent, newContent) => {
  const oldImageIds = extractContentImageIds(oldContent || '');
  const newImageIds = extractContentImageIds(newContent || '');
  
  // Find images that were removed
  const removedImageIds = oldImageIds.filter(id => !newImageIds.includes(id));
  

  
  await Promise.all(deletePromises);
  return removedImageIds.length;
};