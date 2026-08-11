import fs from 'fs';

const files = fs.readdirSync('./src').filter(f => f.endsWith('.jsx'));

files.forEach(file => {
  const filePath = `./src/${file}`;
  let content = fs.readFileSync(filePath, 'utf-8');
  
  let changed = false;

  if (content.includes('import ThemeToggleIcon from')) {
    content = content.replace(/import ThemeToggleIcon from '\.\/ThemeToggleIcon';/g, "import CustomUserButton from './CustomUserButton';");
    changed = true;
  }
  
  if (content.includes('UserButton')) {
    content = content.replace(/import \{ UserButton, useUser, useAuth \} from '@clerk\/clerk-react';/g, "import { useUser, useAuth } from '@clerk/clerk-react';");
    content = content.replace(/import \{ useAuth, useUser, UserButton \} from '@clerk\/clerk-react';/g, "import { useAuth, useUser } from '@clerk/clerk-react';");
    content = content.replace(/import \{ useUser, useAuth, UserButton \} from '@clerk\/clerk-react';/g, "import { useUser, useAuth } from '@clerk/clerk-react';");
    
    content = content.replace(/<ThemeToggleIcon\s*\/>\s*<UserButton[\s\S]*?\/>/gm, '<CustomUserButton />');
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
  }
});
