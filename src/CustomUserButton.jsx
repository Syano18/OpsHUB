import React from 'react';
import { UserButton } from '@clerk/clerk-react';
import { dark } from '@clerk/themes';
import { useTheme } from './contexts/ThemeContext';

export default function CustomUserButton() {
  const { theme, setTheme } = useTheme();

  const handleThemeToggle = () => {
    document.body.classList.add('disable-transitions');
    setTheme(theme === 'light' ? 'dark' : 'light');
    setTimeout(() => {
      document.body.classList.remove('disable-transitions');
    }, 50);
  };

  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);

  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <UserButton 
      afterSignOutUrl="/" 
      userProfileMode="navigation" 
      userProfileUrl="/profile"
      appearance={{
        baseTheme: theme === 'dark' ? dark : undefined,
        elements: {
          userButtonPopoverActionButton__signOut: !isMobile ? { display: "none" } : undefined,
          userButtonPopoverActionButtonIcon__signOut: !isMobile ? { display: "none" } : undefined,
          userButtonPopoverFooter: { display: "none" }
        }
      }}
    >
      {isMobile && (
        <UserButton.MenuItems>
          <UserButton.Action 
            label={theme === 'dark' ? 'Light Mode' : 'Dark Mode'} 
            labelIcon={
              theme === 'dark' ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
                </svg>
              )
            } 
            onClick={handleThemeToggle} 
          />
        </UserButton.MenuItems>
      )}
    </UserButton>
  );
}
