import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SignedIn, SignedOut } from '@clerk/clerk-react';
import Login from './Login';
import Layout from './Layout';
import OfficeActivities from './OfficeActivities';
import DigitalLogbook from './DigitalLogbook';
import DailyTimeRecord from './DailyTimeRecord';
import PersonalCalendar from './PersonalCalendar';
import LeaveCredits from './LeaveCredits';
import Profile from './Profile';

export default function App() {
  return (
    <BrowserRouter>
      <SignedOut>
        <Login />
      </SignedOut>
      <SignedIn>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/office-activities" replace />} />
            <Route path="office-activities" element={<OfficeActivities />} />
            <Route path="digital-logbook" element={<DigitalLogbook />} />
            <Route path="daily-time-record" element={<DailyTimeRecord />} />
            <Route path="personal-calendar" element={<PersonalCalendar />} />
            <Route path="leave-credits" element={<LeaveCredits />} />
            <Route path="profile" element={<Profile />} />
            <Route path="*" element={<Navigate to="/office-activities" replace />} />
          </Route>
        </Routes>
      </SignedIn>
    </BrowserRouter>
  );
}
