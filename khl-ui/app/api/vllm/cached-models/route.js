import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

/**
 * Validates whether a cached folder contains a fully downloaded model
 * capable of being run by vLLM (Transformers/SafeTensors format).
 */
function isValidVllmModel(hubPath, folderName) {
  const modelPath = path.join(hubPath, folderName);
  const snapshotsPath = path.join(modelPath, 'snapshots');
  
  if (!fs.existsSync(snapshotsPath)) {
    return false;
  }
  
  const snapshots = fs.readdirSync(snapshotsPath);
  if (snapshots.length === 0) {
    return false;
  }
  
  const snapshotFolder = path.join(snapshotsPath, snapshots[0]);
  if (!fs.statSync(snapshotFolder).isDirectory()) {
    return false;
  }
  
  // 1. Must contain config.json (standard transformers layout)
  const configPath = path.join(snapshotFolder, 'config.json');
  if (!fs.existsSync(configPath)) {
    return false;
  }
  
  // 2. Check for multi-file model weight index maps
  const safetensorsIndexPath = path.join(snapshotFolder, 'model.safetensors.index.json');
  const pytorchIndexPath = path.join(snapshotFolder, 'pytorch_model.bin.index.json');
  
  try {
    if (fs.existsSync(safetensorsIndexPath)) {
      const indexJson = JSON.parse(fs.readFileSync(safetensorsIndexPath, 'utf8'));
      const files = new Set(Object.values(indexJson.weight_map || {}));
      if (files.size === 0) return false;
      // All weight file parts declared in the index must exist
      return Array.from(files).every(file => fs.existsSync(path.join(snapshotFolder, file)));
    }
    
    if (fs.existsSync(pytorchIndexPath)) {
      const indexJson = JSON.parse(fs.readFileSync(pytorchIndexPath, 'utf8'));
      const files = new Set(Object.values(indexJson.weight_map || {}));
      if (files.size === 0) return false;
      // All weight file parts declared in the index must exist
      return Array.from(files).every(file => fs.existsSync(path.join(snapshotFolder, file)));
    }
    
    // 3. Check for single-file model weights
    const hasSingleWeights = 
      fs.existsSync(path.join(snapshotFolder, 'model.safetensors')) ||
      fs.existsSync(path.join(snapshotFolder, 'pytorch_model.bin'));
      
    return hasSingleWeights;
  } catch (e) {
    console.error(`Error validating cache files for ${folderName}:`, e.message);
    return false;
  }
}

export async function GET() {
  const hubPath = '/root/.cache/huggingface/hub';
  try {
    if (!fs.existsSync(hubPath)) {
      return Response.json({ models: [] });
    }
    const files = fs.readdirSync(hubPath);
    const models = files
      .filter(f => f.startsWith('models--') && fs.statSync(path.join(hubPath, f)).isDirectory() && isValidVllmModel(hubPath, f))
      .map(f => {
        // format is models--[author]--[model-name]
        const parts = f.split('--');
        if (parts.length >= 3) {
          const author = parts[1];
          const model = parts.slice(2).join('--');
          return `${author}/${model}`;
        }
        return null;
      })
      .filter(Boolean);
    return Response.json({ models });
  } catch (err) {
    return Response.json({ error: err.message, models: [] }, { status: 500 });
  }
}
