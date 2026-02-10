export function splitTextIntoChunks(text: string, maxChunkSize: number = 200): string[] {
  if (!text) return [];

  // Remove extra whitespace
  const cleanText = text.replace(/\s+/g, " ").trim();
  
  // Regex to split by sentence endings while keeping the delimiter
  // Matches ., !, ?, ; followed by space or end of string
  // also handles newlines if they were preserved, but we cleaned them above
  const sentenceRegex = /([.!?\n]+)(?=\s|$)/g;
  
  // Split but keep delimiters
  const sentences = cleanText
    .split(sentenceRegex)
    .reduce((acc: string[], part, index, arr) => {
      // If the part is a delimiter (matched by the capturing group), append it to the previous sentence
      if (index % 2 === 1) {
        acc[acc.length - 1] += part;
      } else if (part) {
        // If it's a sentence part, push it
         acc.push(part);
      }
      return acc;
    }, [])
    .filter(s => s.trim().length > 0);

  const chunks: string[] = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    // If a single sentence is too big, we need to split it further by commas or words
    if (sentence.length > maxChunkSize) {
      // If we have a current chunk building up, push it first
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }
      
      // Split long sentence by comma
      const subParts = sentence.split(/([,;])(?=\s)/g).reduce((acc: string[], part, index) => {
          if (index % 2 === 1) { // delimiter
             acc[acc.length - 1] += part;
          } else if(part) {
             acc.push(part);
          }
          return acc;
      }, []);
      
      for (const subPart of subParts) {
         if (subPart.length > maxChunkSize) {
            // If even comma-split part is too big, just push it (or implement word splitting if strictly needed)
            // For now, let's just push it to avoid infinite loops or complex recursion
            // A more robust approach would be to split by space
             if(currentChunk.length + subPart.length > maxChunkSize && currentChunk.length > 0) {
                 chunks.push(currentChunk.trim());
                 currentChunk = subPart;
             } else {
                 if(currentChunk.length > 0) currentChunk += " ";
                 currentChunk += subPart;
             }

         } else {
             if (currentChunk.length + subPart.length > maxChunkSize) {
                chunks.push(currentChunk.trim());
                currentChunk = subPart;
             } else {
                if(currentChunk.length > 0) currentChunk += " ";
                currentChunk += subPart;
             }
         }
      }
      
    } else {
      // Normal sentence appending
      if (currentChunk.length + sentence.length > maxChunkSize) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        if(currentChunk.length > 0) currentChunk += " ";
        currentChunk += sentence;
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
