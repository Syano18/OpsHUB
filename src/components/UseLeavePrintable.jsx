import React from 'react';

export default function UseLeavePrintable({ formData }) {
  // Safe extraction of formData properties
  const {
    officeDepartment = '',
    nameParts = { lastName: '', firstName: '', middleName: '' },
    dateFiled = '',
    position = '',
    salary = '',
    salaryGrade = '',
    inclusiveDates = '',
    requestedDays = '',
    leaveDetailSpecify = '', // Used for "Where Day-off will be spent"
  } = formData || {};

  return (
    <>
      <style type="text/css">
        {`
          @media print {
            @page { size: A4 portrait; margin: 0; }
            body { -webkit-print-color-adjust: exact; }
          }
        `}
      </style>
      <div className="w-[210mm] min-h-[297mm] mx-auto bg-white p-6 text-black font-sans box-border flex flex-col relative" style={{ fontSize: '9pt', lineHeight: '1.2' }}>
        
        {/* Outer Border Container */}
        <div className="border-2 border-black flex-1 flex flex-col relative pb-2 w-full h-full">

          {/* Header */}
          <div className="flex items-center justify-between w-full px-8 mt-6 mb-4">
            <img src="/PSA.png" alt="PSA Logo" className="w-[85px] h-[85px] object-contain" />
            <div className="text-center flex-1">
              <div className="font-bold text-[13pt] leading-tight mb-1">Philippine Statistics Authority</div>
              <div className="font-bold text-[11pt] leading-tight">Union of Statistics Employees</div>
            </div>
            <img src="/Use.png" alt="USE Logo" className="w-[85px] h-[85px] object-contain" />
          </div>

          <div className="flex flex-col items-center mb-6">
            <div className="font-bold text-[11pt] leading-tight">APPLICATION/REQUEST FOR NON-CUMULATIVE AND</div>
            <div className="font-bold text-[11pt] leading-tight mb-1">COMMUTATIVE COMPENSATORY DAY OFF</div>
            <div className="text-[8.5pt]">(Per 2023 USE Collective Negotiation Agreement)</div>
          </div>

          {/* MEMBER'S PROFILE */}
          <div className="border-t-2 border-black flex items-center justify-center py-2 font-bold text-[11pt]">
            MEMBER'S PROFILE
          </div>

          {/* Table Structure for Profile */}
          <div className="flex border-y-2 border-black">
            <div className="flex-1 border-r border-black p-1 pb-3 flex flex-col">
              <div className="font-bold text-[9pt]">1. (Last Name)</div>
              <div className="text-center font-bold uppercase mt-2">{nameParts.lastName || '\u00A0'}</div>
            </div>
            <div className="flex-1 border-r border-black p-1 pb-3 flex flex-col">
              <div className="font-bold text-[9pt]">(First Name)</div>
              <div className="text-center font-bold uppercase mt-2">{nameParts.firstName || '\u00A0'}</div>
            </div>
            <div className="flex-1 p-1 pb-3 flex flex-col">
              <div className="font-bold text-[9pt]">(Middle Name)</div>
              <div className="text-center font-bold uppercase mt-2">{nameParts.middleName || '\u00A0'}</div>
            </div>
          </div>

          <div className="flex border-b-2 border-black">
            <div className="w-[60%] border-r border-black p-1 py-2 flex items-center">
              <span className="font-bold text-[9pt] mr-2">2. Position/Designation:</span>
              <span className="text-[9pt] uppercase text-black flex-1 text-left px-2">{position}</span>
            </div>
            <div className="w-[40%] p-1 py-2 flex items-center">
              <span className="font-bold text-[9pt] mr-2">3. Salary Grade:</span>
              <span className="text-[9pt] text-black flex-1 text-left px-2">{salaryGrade}</span>
            </div>
          </div>

          <div className="border-b-2 border-black p-1 py-2 flex items-center">
            <span className="font-bold text-[9pt] mr-2">4.Office/Service/Division/RSSO/PSO:</span>
            <span className="text-[9pt] uppercase text-black flex-1 text-left px-2">{officeDepartment}</span>
          </div>

          {/* DETAILS OF AVAILMENT */}
          <div className="flex items-center justify-center py-4 font-bold text-[11pt]">
            DETAILS OF AVAILMENT
          </div>

          <div className="flex justify-between px-2 mb-4">
            <div className="w-[48%] flex items-end">
              <span className="font-bold text-[9pt] whitespace-nowrap mr-2">5. Date of Filing:</span>
              <div className="flex-1 border-b border-black text-center text-[9pt] text-black pb-0.5 px-1">{dateFiled}</div>
            </div>
            <div className="w-[48%] flex items-end">
              <span className="font-bold text-[9pt] whitespace-nowrap mr-2">6. Where Day-off will be spent:</span>
              <div className="flex-1 border-b border-black text-center text-[9pt] text-black pb-0.5 px-1">{leaveDetailSpecify || '\u00A0'}</div>
            </div>
          </div>

          <div className="flex justify-between px-2 mb-12">
            <div className="w-[48%] flex items-end">
              <span className="font-bold text-[9pt] whitespace-nowrap mr-2">7. No. of Days Availed:</span>
              <div className="flex-1 border-b border-black text-center text-[9pt] text-black pb-0.5 px-1">{requestedDays}</div>
            </div>
            <div className="w-[48%] flex items-end">
              <span className="font-bold text-[9pt] whitespace-nowrap mr-2">8. Date/s Availed:</span>
              <div className="flex-1 border-b border-black text-center text-[8.5pt] text-black pb-0.5 px-1">{inclusiveDates}</div>
            </div>
          </div>

          <div className="flex justify-center mb-6">
            <div className="w-[50%] flex flex-col items-center">
              <div className="w-full border-b border-black pb-0.5 font-bold text-[10pt] text-center uppercase h-[20px]">
                {nameParts.firstName || nameParts.lastName ? `${nameParts.firstName} ${nameParts.middleName ? nameParts.middleName.charAt(0) + '.' : ''} ${nameParts.lastName}` : ''}
              </div>
              <div className="font-bold text-[9pt] mt-1">Signature over printed name of the member</div>
            </div>
          </div>

          {/* ACTION ON THE APPLICATION */}
          <div className="border-t-2 border-black px-2 pt-2 pb-6">
            <div className="font-bold text-[10pt] mb-6">9. ACTION ON THE APPLICATION</div>

            <div className="flex justify-between px-2 mb-8">
              <div className="w-[40%] flex flex-col">
                <div className="font-bold text-[9pt] mb-8">Noted by:</div>
                <div className="font-bold text-center border-b border-black pb-0.5 text-[10pt] uppercase">RANDOLF M. LADERAS</div>
                <div className="font-bold text-[9pt] mt-1">Chapter President</div>
                <div className="flex mt-2 items-end">
                  <span className="font-bold text-[9pt] mr-2">Date:</span>
                  <div className="flex-1 border-b border-black h-[14px]"></div>
                </div>
              </div>

              <div className="w-[40%] flex flex-col">
                <div className="font-bold text-[9pt] mb-8">Recommending Approval:</div>
                <div className="font-bold text-center border-b border-black pb-0.5 text-[10pt] uppercase">DONAH GRACE C. CAPULAC</div>
                <div className="font-bold text-[9pt] mt-1">HRMO</div>
                <div className="flex mt-2 items-end">
                  <span className="font-bold text-[9pt] mr-2">Date:</span>
                  <div className="flex-1 border-b border-black h-[14px]"></div>
                </div>
              </div>
            </div>

            <div className="px-2 mb-10 relative">
              <div className="font-bold text-[9pt] absolute left-2 top-0">APPROVED:</div>
              <div className="flex justify-center mt-12">
                <div className="w-[45%] flex flex-col">
                  <div className="font-bold text-center border-b border-black pb-0.5 text-[10pt] uppercase mx-8">MARIBEL M. DALAYDAY</div>
                  <div className="font-bold text-center text-[9pt] mt-1">CSS</div>
                </div>
              </div>
            </div>
          </div>

          <div className="absolute bottom-2 left-2 flex flex-col gap-0.5">
            <div className="font-bold text-[7.5pt] italic">Note: This Form is for USE Member only</div>
            <div className="font-bold text-[7.5pt] italic">2023 CNA Article II, Series 8</div>
          </div>

        </div>
      </div>
    </>
  );
}
