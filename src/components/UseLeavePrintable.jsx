import React from 'react';

export default function UseLeavePrintable({ formData, signatories = {} }) {
  // Safe extraction of formData properties
  const {
    officeDepartment = '',
    nameParts = { lastName: '', firstName: '', middleName: '' },
    dateFiled = '',
    position = '',
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
      <div className="w-[210mm] min-h-[297mm] mx-auto bg-white p-6 pb-2 text-black font-sans box-border flex flex-col relative" style={{ fontSize: '9pt', lineHeight: '1.2' }}>
        
        {/* Header */}
        <div className="flex justify-between items-center w-full px-8 mt-4 mb-4">
          <img src="/PSA.png" alt="PSA Logo" className="w-[85px] h-[85px] object-contain" />
          <div className="text-center flex-1">
            <div className="font-bold text-[12pt] uppercase tracking-wide">Philippine Statistics Authority</div>
            <div className="font-bold text-[14pt] uppercase tracking-wide">Union of Statistics Employees</div>
          </div>
          <img src="/Use.png" alt="USE Logo" className="w-[95px] h-[85px] object-contain" />
        </div>

        <div className="flex flex-col items-center mb-6">
          <div className="font-bold text-[12.5pt] text-center tracking-tight">APPLICATION FOR NON-CUMULATIVE AND COMMUTATIVE</div>
          <div className="font-bold text-[12.5pt] text-center tracking-tight">COMPENSATORY DAY OFF</div>
          <div className="italic text-[10pt] mt-2 font-medium">(Per 2025 - 2029 Collective Negotiation Agreement)</div>
        </div>

        {/* Outer Border Container */}
        <div className="border-[1.5px] border-black flex flex-col w-full">
          
          {/* Row 1: Office, Name */}
          <div className="flex border-b-[1.5px] border-black h-[40px]">
            <div className="w-[45%] border-r-[1.5px] border-black p-1 flex flex-col justify-between">
              <span className="text-[9pt] leading-none">1. OFFICE/DEPARTMENT</span>
              <div className="text-center font-bold uppercase px-2 leading-none pb-0.5">{officeDepartment}</div>
            </div>
            <div className="w-[55%] p-1 flex flex-col justify-between">
              <div className="flex w-full">
                <span className="text-[9pt] leading-none w-[60px]">2. NAME :</span>
                <div className="flex flex-1">
                  <div className="flex-1 text-[8pt] text-center leading-none">(Last)</div>
                  <div className="flex-1 text-[8pt] text-center leading-none">(First)</div>
                  <div className="flex-1 text-[8pt] text-center leading-none">(Middle)</div>
                </div>
              </div>
              <div className="flex w-full">
                <div className="w-[60px]"></div>
                <div className="flex flex-1 text-center font-bold uppercase">
                  <div className="flex-1 leading-none pb-0.5">{nameParts.lastName || '\u00A0'}</div>
                  <div className="flex-1 leading-none pb-0.5">{nameParts.firstName || '\u00A0'}</div>
                  <div className="flex-1 leading-none pb-0.5">{nameParts.middleName || '\u00A0'}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: Date, Position, Salary Grade */}
          <div className="flex border-b-[1.5px] border-black items-end h-[35px] pb-1">
            <div className="w-[35%] p-1 flex items-end">
              <span className="text-[9pt] mr-1">3. DATE OF FILING:</span>
              <span className="border-b border-black flex-1 text-center font-bold px-1">{dateFiled}</span>
            </div>
            <div className="w-[35%] p-1 flex items-end">
              <span className="text-[9pt] mr-1">4. POSITION</span>
              <span className="border-b border-black flex-1 text-center font-bold px-1 uppercase whitespace-nowrap overflow-hidden" style={{fontSize: position?.length > 25 ? '7pt' : '9pt'}}>{position}</span>
            </div>
            <div className="w-[30%] p-1 flex items-end">
              <span className="text-[9pt] mr-1">5. SALARY GRADE:</span>
              <span className="border-b border-black flex-1 text-center font-bold px-1">{salaryGrade}</span>
            </div>
          </div>

          <div className="border-b-[1.5px] border-t-2 border-black py-1 font-bold text-center text-[10pt]">
            6. DETAILS OF APPLICATION
          </div>

          {/* Row 3: 6.A and 6.B/6.C */}
          <div className="flex border-b-[1.5px] border-black border-t-[1.5px]" style={{ minHeight: '140px' }}>
            <div className="w-[50%] border-r-[1.5px] border-black p-1 pt-1 pb-4 flex flex-col">
              <div className="text-[9pt] mb-2 uppercase">6.A TYPE OF CDO TO BE AVAILED</div>
              <div className="flex items-center gap-2 mb-1 px-2">
                <div className="w-3 h-3 border border-black flex items-center justify-center font-bold text-[10pt]"><span style={{transform: 'translateY(-1px)'}}>✓</span></div>
                <div className="text-[9pt]">Ordinary</div>
              </div>
              <div className="flex items-center gap-2 mb-1 px-2">
                <div className="w-3 h-3 border border-black flex items-center justify-center font-bold text-[10pt]"></div>
                <div className="text-[9pt]">Declaration of Health Emergency/Calamity</div>
              </div>
              <div className="flex items-center gap-2 px-2">
                <div className="w-3 h-3 border border-black flex items-center justify-center font-bold text-[10pt]"></div>
                <div className="text-[9pt]">Interfaith/Cultural Observance</div>
              </div>
            </div>

            <div className="w-[50%] p-1 pt-1 flex flex-col">
              <div className="text-[9pt] uppercase">6.B DETAILS OF CDO</div>
              <div className="flex items-end pl-3 mt-1 pr-2">
                <span className="italic text-[9pt]">Where day-off will be spent: </span>
                <span className="border-b-[1.5px] border-black flex-1 ml-1 text-center font-bold uppercase">{leaveDetailSpecify || '\u00A0'}</span>
              </div>
              <div className="text-[9pt] uppercase mt-2">6.C NUMBER OF WORKING DAYS APPLIED FOR</div>
              <div className="px-4 mt-1 flex flex-col">
                <div className="border-b-[1.5px] border-black h-5 w-full text-center font-bold flex items-end justify-center pb-0.5">{requestedDays}</div>
                <div className="text-[9pt] mt-1 pl-1">INCLUSIVE DATES</div>
                <div className="border-b-[1.5px] border-black h-5 w-full text-center font-bold flex items-end justify-center pb-0.5">{inclusiveDates}</div>
              </div>
              
              <div className="mt-8 flex justify-center w-full">
                <div className="w-[75%] flex flex-col items-center">
                  <div className="border-b-[1.5px] border-black w-full h-[10px]"></div>
                  <div className="text-[8.5pt] mt-0.5">Signature over Printed Name</div>
                </div>
              </div>
            </div>
          </div>

          <div className="border-b-[1.5px] border-black py-1 border-t-2 font-bold text-center text-[10pt]">
            7. DETAILS OF ACTION ON APPLICATION
          </div>

          {/* Action Row 1 */}
          <div className="flex border-b-[1.5px] border-t-[1.5px] border-black" style={{ minHeight: '120px' }}>
            <div className="w-[50%] border-r-[1.5px] border-black p-1 flex flex-col relative">
              <div className="text-[9pt]">7.A <span className="uppercase">DATE OF USE MEMBERSHIP</span> <span className="italic font-normal">(For verification of USE Staff)</span></div>
              <div className="absolute bottom-6 w-full flex justify-center">
                <div className="w-[70%] border-b border-black"></div>
              </div>
              <div className="absolute bottom-2 w-full text-center text-[9pt]">(Authorize Officer)</div>
            </div>
            <div className="w-[50%] p-1 flex flex-col relative">
              <div className="text-[9pt] uppercase">7.B VERIFIED BY:</div>
              <div className="mt-6 flex flex-col items-center justify-center w-full">
                <div className="font-bold text-[10pt] uppercase">{signatories?.chapter?.name || 'RANDOLF M. LADERAS'}</div>
                <div className="border-t border-black w-[90%] text-center text-[9pt]">{signatories?.chapter?.position || 'Supervising Statistical Specialist/Chapter Officer'}</div>
              </div>
              <div className="absolute bottom-2 left-2 flex gap-1">
                <span className="text-[9pt]">Date:</span>
                <div className="w-16 border-b border-black"></div>
              </div>
            </div>
          </div>

          {/* Action Row 2 */}
          <div className="flex border-black" style={{ minHeight: '120px' }}>
            <div className="w-[50%] border-r-[1.5px] border-black p-1 flex flex-col relative">
              <div className="text-[9pt] uppercase">7.C NOTED BY:</div>
              <div className="mt-6 flex flex-col items-center justify-center w-full">
                <div className="font-bold text-[10pt] uppercase">{signatories?.hr?.name || 'DONAH GRACE C. CAPULAC'}</div>
                <div className="text-[9pt]">{signatories?.hr?.position || 'AO I - HR Designate'}</div>
              </div>
              <div className="absolute bottom-2 left-2 flex gap-1">
                <span className="text-[9pt]">Date:</span>
                <div className="w-16 border-b border-black"></div>
              </div>
            </div>
            <div className="w-[50%] p-1 flex flex-col relative">
              <div className="text-[9pt] uppercase">7.D APPROVED BY:</div>
              <div className="mt-6 flex flex-col items-center justify-center w-full">
                <div className="font-bold text-[10pt] uppercase">{signatories?.chief?.name || 'MARIBEL M. DALAYDAY'}</div>
                <div className="text-[9pt]">{signatories?.chief?.position || 'Chief Statistical Specialist'}</div>
              </div>
              <div className="absolute bottom-2 left-2 flex gap-1">
                <span className="text-[9pt]">Date:</span>
                <div className="w-16 border-b border-black"></div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-2 text-[9pt] leading-tight font-medium pb-2">
          <div className="italic text-slate-800">Note: To be availed of USE Members Only</div>
          <div className="italic text-slate-800">Per 2025-2029 Collective Negotiation Agreement Section 8 of Article II</div>
        </div>
        
        <div className="absolute bottom-3 right-6 text-[8pt] italic text-slate-800">Rev. No 1</div>

      </div>
    </>
  );
}
