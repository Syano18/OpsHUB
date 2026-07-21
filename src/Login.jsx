import React, { useState, useEffect } from 'react';
import { useSignIn } from '@clerk/clerk-react';
import Alert from './Alert';
import { turso } from './db';

export default function Login() {
   const { isLoaded, signIn, setActive } = useSignIn();
   const [email, setEmail] = useState('');
   const [password, setPassword] = useState('');
   const [error, setError] = useState('');
   const [isLoading, setIsLoading] = useState(false);
   const [loadingAction, setLoadingAction] = useState(null);

   // Check for Google OAuth redirect errors
   useEffect(() => {
      const href = window.location.href;
      console.log("Checking URL for OAuth errors:", href);

      let params = new URLSearchParams(window.location.search);
      
      // Robustly parse the hash if the error is hidden there
      if (!params.get('error') && window.location.hash.includes('error=')) {
         const hashStr = window.location.hash;
         const queryPart = hashStr.includes('?') ? hashStr.substring(hashStr.indexOf('?') + 1) : hashStr.substring(1);
         params = new URLSearchParams(queryPart);
      }

      const oauthError = params.get('error_description') || params.get('error');
      if (oauthError) {
         console.log("Found OAuth Error:", oauthError);
         const decodedError = decodeURIComponent(oauthError).replace(/\+/g, ' ');
         if (decodedError.includes("inactive")) {
            setError(decodedError);
         } else {
            setError(`Google Sign In failed: ${decodedError}`);
         }
         window.history.replaceState({}, document.title, window.location.pathname);
      }
   }, []);

   // State to manage password visibility toggle
   const [isVisible, setIsVisible] = useState(false);

   const toggleVisibility = () => {
      setIsVisible((prevState) => !prevState);
   };

   const handleSubmit = async (e) => {
      e.preventDefault();
      if (!isLoaded) return;
      
      setError('');
      setIsLoading(true);
      setLoadingAction('manual');
      
      try {
         // Check if user is active in DB before authenticating
         const userStatusRes = await turso.execute({
            sql: "SELECT Status FROM User_Permissions WHERE LOWER(Email) = LOWER(?)",
            args: [email]
         });

         if (userStatusRes.rows.length > 0) {
            const status = userStatusRes.rows[0].Status;
            if (status && status.toLowerCase() === 'inactive') {
               setError("Your account is inactive. Please contact your administrator.");
               setIsLoading(false);
               setLoadingAction(null);
               return;
            }
         }

         const result = await signIn.create({
            identifier: email,
            password,
         });

         if (result.status === "complete") {
            await setActive({ session: result.createdSessionId });
            console.log("Login successful!");
         } else {
            setError("Something went wrong. Please try again.");
            setIsLoading(false);
            setLoadingAction(null);
         }
      } catch (err) {
         setError(err.errors?.[0]?.longMessage || "Failed to sign in. Please check your credentials.");
         setIsLoading(false);
         setLoadingAction(null);
      }
   };

   const handleGoogleSignIn = async (e) => {
      e.preventDefault();
      if (!isLoaded) return;
      
      setIsLoading(true);
      setLoadingAction('google');

      try {
         await signIn.authenticateWithRedirect({
            strategy: "oauth_google",
            redirectUrl: "/",
            redirectUrlComplete: "/"
         });
      } catch (err) {
         console.error("Google Sign In Error:", err);
         setError(err.errors?.[0]?.longMessage || err.message || "Failed to initialize Google Sign In.");
         setIsLoading(false);
         setLoadingAction(null);
      }
   };

   return (
      // Main container centering the form vertically and horizontally
      <main className="px-4 md:px-8 min-h-screen flex flex-col items-center justify-center">
         <div className="py-4 max-w-md w-full">
            <div
               className="p-6 rounded-lg bg-white border border-slate-300 shadow-xs md:p-8  ">

               {/* Logo Section */}
               <div className="mb-4 flex justify-center">
                  <a href="#"><img src="/logo.png" alt="logo" className="w-45 min-h-8" />
                  </a>
               </div>
               <div className="text-center">
                  {/* <h1 className="text-slate-900 text-center text-xl font-semibold mb-2 ">Welcome back</h1> */}
                  <p className="text-sm text-slate-600 ">Enter your email and password to sign in.</p>
               </div>

               {/* Login Form */}
               <form className="space-y-6 mt-6" onSubmit={handleSubmit}>
                  
                  {/* Error Message */}
                  <Alert message={error} onClose={() => setError('')} />

                  {/* Email Input Field */}
                  <div>
                     <label htmlFor="email"
                        className="mb-2 text-slate-900 font-medium text-sm inline-block ">Email</label>
                     <input
                        type="email"
                        id="email"
                        name="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="officialchano18@gmail.com"
                        className="px-3 py-2.5 text-sm text-slate-900 rounded-md bg-white w-full outline-1 -outline-offset-1 outline-slate-300 focus:outline-2 focus:-outline-offset-2 focus:outline-teal-600   "
                        required
                     />
                  </div>

                  {/* Password Input Field with Toggle */}
                  <div className="relative">
                     <label htmlFor="password"
                        className="mb-2 text-slate-900 font-medium text-sm inline-block ">Password</label>

                     {/* Button to toggle password visibility */}
                     <button
                        type="button"
                        id="togglePassword"
                        onClick={toggleVisibility}
                        aria-label={isVisible ? "Hide password" : "Show password"}
                        aria-pressed={isVisible}
                        className="absolute top-1 right-2 p-0.5 flex cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 rounded">
                        <svg xmlns="http://www.w3.org/2000/svg"
                           className="size-[18px] fill-slate-400 text-slate-400 overflow-visible" viewBox="0 0 128 128">
                           <path
                              d="M64 104C22.127 104 1.367 67.496.504 65.943a4 4 0 0 1 0-3.887C1.367 60.504 22.127 24 64 24s62.633 36.504 63.496 38.057a4 4 0 0 1 0 3.887C126.633 67.496 105.873 104 64 104zM8.707 63.994C13.465 71.205 32.146 96 64 96c31.955 0 50.553-24.775 55.293-31.994C114.535 56.795 95.854 32 64 32 32.045 32 13.447 56.775 8.707 63.994zM64 88c-13.234 0-24-10.766-24-24s10.766-24 24-24 24 10.766 24 24-10.766 24-24 24zm0-40c-8.822 0-16 7.178-16 16s7.178 16 16 16 16-7.178 16-16-7.178-16-16-16z">
                           </path>
                           {!isVisible && (
                              <path
                                 d="M15 15l98 98"
                                 stroke="currentColor"
                                 strokeWidth="10"
                                 strokeLinecap="round"
                                 className="stroke-slate-400"
                              />
                           )}
                        </svg>
                     </button>

                     <input
                        type={isVisible ? "text" : "password"}
                        id="password"
                        name="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="px-3 py-2.5 text-sm text-slate-900 rounded-md bg-white w-full outline-1 -outline-offset-1 outline-slate-300 focus:outline-2 focus:-outline-offset-2 focus:outline-teal-600   "
                        required
                     />
                  </div>

                  {/* Form Actions (Remember me & Forgot password) */}
                  <div className="flex items-start flex-wrap gap-2">
                     <label className="flex items-center group has-[input:checked]:text-slate-900">
                        <input id="remember" name="remember" type="checkbox" className="sr-only" />
                        {/* Custom box */}
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded outline-1 outline-slate-300 
                              bg-white 
                              group-has-[input:checked]:bg-teal-600
                              group-has-[input:checked]:outline-teal-600
                              group-focus-within:outline-2
                              group-focus-within:outline-teal-600" aria-hidden="true">
                           {/* Checkmark */}
                           <svg className="size-3 text-white opacity-0 group-has-[input:checked]:opacity-100" viewBox="0 0 12 10"
                              fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 5l3 3 7-7" />
                           </svg>
                        </span>
                        <span className="ml-3 text-sm text-slate-700 ">
                           Remember me
                        </span>
                     </label>

                     <a href="#"
                        className="ml-auto text-sm font-medium text-teal-700  hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded">
                        Forgot password?
                     </a>
                  </div>

                  {/* Submit Button */}
                  <button type="submit"
                     disabled={isLoading}
                     className={`w-full py-2 px-3.5 text-sm rounded-md font-semibold tracking-wide text-white border border-teal-600 bg-teal-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 flex items-center justify-center gap-2 ${
                        isLoading ? "opacity-70 cursor-not-allowed scale-[0.98]" : "hover:bg-teal-700 transition-all cursor-pointer"
                     }`}>
                     {isLoading && loadingAction === 'manual' ? (
                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                           <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                           <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                     ) : null}
                     {isLoading && loadingAction === 'manual' ? "Signing in..." : "Sign in"}
                  </button>
               </form>

               {/* Divider */}
               <div className="flex items-center gap-4 my-6">
                  <hr className="w-full border-slate-300 " />
                  <p className="text-sm text-slate-700 text-center ">or</p>
                  <hr className="w-full border-slate-300 " />
               </div>

               {/* Social Login Buttons */}
               <div>
                  <button
                     onClick={handleGoogleSignIn}
                     type="button"
                     disabled={isLoading}
                     className={`w-full flex items-center justify-center gap-2.5 py-2 px-3.5 text-sm rounded-md font-semibold text-slate-900 border border-slate-300 bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                        isLoading ? "opacity-70 cursor-not-allowed scale-[0.98]" : "hover:bg-gray-50 transition-all cursor-pointer"
                     }`}>
                     {isLoading && loadingAction === 'google' ? (
                        <svg className="animate-spin h-4 w-4 text-slate-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                           <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                           <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                     ) : (
                     <svg xmlns="http://www.w3.org/2000/svg" className="size-[18px]" viewBox="0 0 512 512" aria-hidden="true">
                        <path fill="#fbbd00"
                           d="M120 256c0-25.367 6.989-49.13 19.131-69.477v-86.308H52.823C18.568 144.703 0 198.922 0 256s18.568 111.297 52.823 155.785h86.308v-86.308C126.989 305.13 120 281.367 120 256z"
                           data-original="#fbbd00" />
                        <path fill="#0f9d58"
                           d="m256 392-60 60 60 60c57.079 0 111.297-18.568 155.785-52.823v-86.216h-86.216C305.044 385.147 281.181 392 256 392z"
                           data-original="#0f9d58" />
                        <path fill="#31aa52"
                           d="m139.131 325.477-86.308 86.308a260.085 260.085 0 0 0 22.158 25.235C123.333 485.371 187.62 512 256 512V392c-49.624 0-93.117-26.72-116.869-66.523z"
                           data-original="#31aa52" />
                        <path fill="#3c79e6"
                           d="M512 256a258.24 258.24 0 0 0-4.192-46.377l-2.251-12.299H256v120h121.452a135.385 135.385 0 0 1-51.884 55.638l86.216 86.216a260.085 260.085 0 0 0 25.235-22.158C485.371 388.667 512 324.38 512 256z"
                           data-original="#3c79e6" />
                        <path fill="#cf2d48"
                           d="m352.167 159.833 10.606 10.606 84.853-84.852-10.606-10.606C388.668 26.629 324.381 0 256 0l-60 60 60 60c36.326 0 70.479 14.146 96.167 39.833z"
                           data-original="#cf2d48" />
                        <path fill="#eb4132"
                           d="M256 120V0C187.62 0 123.333 26.629 74.98 74.98a259.849 259.849 0 0 0-22.158 25.235l86.308 86.308C162.883 146.72 206.376 120 256 120z"
                           data-original="#eb4132" />
                     </svg>
                     )}
                     {isLoading && loadingAction === 'google' ? "Signing in..." : "Sign in with Google"}
                  </button>
               </div>

            </div>

            {/* App Footer */}
            <footer className="mt-2 flex justify-between text-slate-500 text-sm font-medium px-2">
               <span>TechCraft by Chano</span>
               <span>v1.0</span>
            </footer>
         </div>
      </main>
   );
}
