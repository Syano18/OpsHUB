import React from 'react';

export default function CscForm6Printable({ formData, userBalances, signatories }) {
  // Safe extraction of formData properties
  const {
    officeDepartment = '',
    nameParts = { lastName: '', firstName: '', middleName: '' },
    dateFiled = '',
    position = '',
    salary = '',
    fileLeaveType = '',
    leaveDetailType = '',
    leaveDetailSpecify = '',
    startDate = '',
    endDate = '',
    reason = '',
    requestedDays = '',
  } = formData || {};

  const isChecked = (type) => fileLeaveType === type ? '✓' : '';

  const parsedDays = parseFloat(requestedDays) || 0;
  const isVL = fileLeaveType === 'Vacation Leave' || fileLeaveType === 'Mandatory/Forced Leave';
  const isSL = fileLeaveType === 'Sick Leave';
  
  const vlLess = isVL && parsedDays > 0 ? parsedDays.toFixed(2) : '';
  const slLess = isSL && parsedDays > 0 ? parsedDays.toFixed(2) : '';
  
  const vlBalanceAfter = userBalances?.vl_balance != null 
    ? (userBalances.vl_balance - (isVL ? parsedDays : 0)).toFixed(2) 
    : ' ';
    
  const slBalanceAfter = userBalances?.sl_balance != null 
    ? (userBalances.sl_balance - (isSL ? parsedDays : 0)).toFixed(2) 
    : ' ';

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
      <div className="w-[210mm] min-h-[297mm] mx-auto bg-white p-4 text-black font-sans box-border flex flex-col" style={{ fontSize: '8pt', lineHeight: '1.0' }}>

        {/* Header */}
        <div className="flex justify-between items-start mb-0 relative">
          <div className="text-[7pt] italic leading-tight absolute left-0 top-0">Civil Service Form No. 6<br />Revised 2020</div>
        </div>

        <div className="flex flex-col items-center mb-1 mt-1">
          <div className="flex items-center justify-between w-full px-12">
            <img src="/PSA.png" alt="PSA Logo" className="w-[65px] h-[65px] object-contain ml-8" />
            <div className="text-center flex-1">
              <div className="font-bold text-[10pt] leading-tight">Republic of the Philippines</div>
              <div className="font-serif text-[11pt] font-bold tracking-wide mt-0.5 text-slate-800">PHILIPPINE STATISTICS AUTHORITY</div>
              <div className="text-[8pt] mt-0 text-black">PSA Complex, East Avenue, Diliman, Quezon City 1100</div>
            </div>
            <div className="flex items-center gap-4 mr-8">
              <img src="/Bagong.png" alt="Bagong Pilipinas Logo" className="w-[80px] h-[80px] object-contain" />
            </div>
          </div>
          <div className="font-bold text-[13pt] mt-1 tracking-wide">APPLICATION FOR LEAVE</div>
        </div>

        {/* Main Table Structure */}
        <table className="w-full border-collapse border border-black mb-2">
          <tbody>
            {/* Row 1: Office/Department and Name */}
            <tr className="border-b border-black">
              <td className="w-1/3 border-r border-black p-1 align-top">
                <div className="flex">
                  <div className="whitespace-nowrap">1. OFFICE/DEPARTMENT</div>
                </div>
                <div className="flex mt-1">
                  <div className="font-bold border-b border-black pb-0.5 uppercase text-center flex-1 text-[9pt]">{officeDepartment}</div>
                </div>
              </td>
              <td className="w-2/3 p-1 align-top">
                <div className="flex">
                  <div className="whitespace-nowrap mr-2">2. NAME:</div>
                  <div className="flex-1 flex gap-4">
                    <div className="flex-1 text-center text-[9pt]">(Last)</div>
                    <div className="flex-1 text-center text-[9pt]">(First)</div>
                    <div className="flex-1 text-center text-[9pt]">(Middle)</div>
                  </div>
                </div>
                <div className="flex mt-1">
                  <div className="whitespace-nowrap mr-2 opacity-0">2. NAME:</div>
                  <div className="flex-1 flex gap-4 text-[9pt]">
                    <div className="font-bold text-center border-b border-black uppercase flex-1 pb-0.5">{nameParts.lastName}</div>
                    <div className="font-bold text-center border-b border-black uppercase flex-1 pb-0.5">{nameParts.firstName}</div>
                    <div className="font-bold text-center border-b border-black uppercase flex-1 pb-0.5">{nameParts.middleName}</div>
                  </div>
                </div>
              </td>
            </tr>

            {/* Row 2: Date, Position, Salary */}
            <tr className="border-b border-black">
              <td className="w-1/3 border-r border-black p-1 align-top">
                <div>3. DATE OF FILING</div>
                <div className="font-bold mt-1 border-b border-black pb-0.5 text-center text-[9pt]">{dateFiled}</div>
              </td>
              <td className="w-2/3 p-0 align-top">
                <table className="w-full h-full border-collapse">
                  <tbody>
                    <tr>
                      <td className="w-1/2 border-r border-black p-1 align-top">
                        <div>4. POSITION</div>
                        <div 
                          className="font-bold mt-1 border-b border-black pb-0.5 text-center uppercase whitespace-nowrap"
                          style={{ 
                            fontSize: position?.length > 40 ? '6pt' : position?.length > 30 ? '7pt' : position?.length > 20 ? '8pt' : '9pt' 
                          }}
                        >
                          {position}
                        </div>
                      </td>
                      <td className="w-1/2 p-1 align-top">
                        <div>5. SALARY</div>
                        <div className="font-bold mt-1 border-b border-black pb-0.5 text-center text-[9pt]">
                          {salary ? (isNaN(parseFloat(salary.toString().replace(/,/g, ''))) ? salary : parseFloat(salary.toString().replace(/,/g, '')).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) : ''}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Section 6 */}
        <div className="border border-black mb-4 text-sm">
          <div className="border-b border-black bg-gray-100 p-1 text-center font-bold tracking-wide">
            6. DETAILS OF APPLICATION
          </div>

          <table className="w-full border-collapse">
            <tbody>
               <tr>
                <td className="w-1/2 border-r border-black p-1 align-top">
                  <div className="font-bold mb-1">6.A TYPE OF LEAVE TO BE AVAILED OF</div>
                  <div className="space-y-0.5 ml-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 min-w-[14px] min-h-[14px] flex-shrink-0 border border-black flex items-center justify-center font-bold">{isChecked("Vacation Leave")}</div>
                      <span className="whitespace-nowrap">Vacation Leave <span className="text-[5.5pt]">(Sec. 51, Rule XVI, Omnibus Rules Implementing E.O. No. 292)</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 min-w-[14px] min-h-[14px] flex-shrink-0 border border-black flex items-center justify-center font-bold">{isChecked("Mandatory/Forced Leave")}</div>
                      <span className="whitespace-nowrap">Mandatory/Forced Leave <span className="text-[5.5pt]">(Sec. 25, Rule XVI, Omnibus Rules Implementing E.O. No. 292)</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 min-w-[14px] min-h-[14px] flex-shrink-0 border border-black flex items-center justify-center font-bold">{isChecked("Sick Leave")}</div>
                      <span className="whitespace-nowrap">Sick Leave <span className="text-[5.5pt]">(Sec. 43, Rule XVI, Omnibus Rules Implementing E.O. No. 292)</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 min-w-[14px] min-h-[14px] flex-shrink-0 border border-black flex items-center justify-center font-bold"></div>
                      <span className="whitespace-nowrap">Maternity Leave <span className="text-[5.5pt]">(R.A. No. 11210 / IRR issued by CSC, DOLE and PhilHealth)</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 min-w-[14px] min-h-[14px] flex-shrink-0 border border-black flex items-center justify-center font-bold"></div>
                      <span className="whitespace-nowrap">Paternity Leave <span className="text-[5.5pt]">(R.A. No. 8187 / CSC MC No. 71, s. 1998, as amended)</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 min-w-[14px] min-h-[14px] flex-shrink-0 border border-black flex items-center justify-center font-bold">{isChecked("Special Privilege Leave")}</div>
                      <span className="whitespace-nowrap">Special Privilege Leave <span className="text-[5.5pt]">(Sec. 21, Rule XVI, Omnibus Rules Implementing E.O. No. 292)</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 min-w-[14px] min-h-[14px] flex-shrink-0 border border-black flex items-center justify-center font-bold"></div>
                      <span className="whitespace-nowrap">Solo Parent Leave <span className="text-[5.5pt]">(RA No. 8972 / CSC MC No. 8, s. 2004)</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 min-w-[14px] min-h-[14px] flex-shrink-0 border border-black flex items-center justify-center font-bold"></div>
                      <span className="whitespace-nowrap">Study Leave <span className="text-[5.5pt]">(Sec. 68, Rule XVI, Omnibus Rules Implementing E.O. No. 292)</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 min-w-[14px] min-h-[14px] flex-shrink-0 border border-black flex items-center justify-center font-bold"></div>
                      <span className="whitespace-nowrap">10-Day VAWC Leave <span className="text-[5.5pt]">(RA No. 9262 / CSC MC No. 15, s. 2005)</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 min-w-[14px] min-h-[14px] flex-shrink-0 border border-black flex items-center justify-center font-bold"></div>
                      <span className="whitespace-nowrap">Rehabilitation Privilege <span className="text-[5.5pt]">(Sec. 55, Rule XVI, Omnibus Rules Implementing E.O. No. 292)</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 min-w-[14px] min-h-[14px] flex-shrink-0 border border-black flex items-center justify-center font-bold"></div>
                      <span className="whitespace-nowrap">Special Leave Benefits for Women <span className="text-[5.5pt]">(RA No. 9710 / CSC MC No. 25, s. 2010)</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 min-w-[14px] min-h-[14px] flex-shrink-0 border border-black flex items-center justify-center font-bold"></div>
                      <span className="whitespace-nowrap">Special Emergency (Calamity) Leave <span className="text-[5.5pt]">(CSC MC No. 2, s. 2012, as amended)</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 min-w-[14px] min-h-[14px] flex-shrink-0 border border-black flex items-center justify-center font-bold"></div>
                      <span className="whitespace-nowrap">Adoption Leave <span className="text-[5.5pt]">(R.A. No. 8552)</span></span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className="w-3.5 h-3.5 min-w-[14px] min-h-[14px] flex-shrink-0 border border-black flex items-center justify-center font-bold">{isChecked("Wellness Leave") || isChecked("USE Leave") ? '✓' : ''}</div>
                      <span>Others:</span>
                    </div>
                    <div className="border-b border-black mt-1 pb-1 font-bold ml-6 uppercase">
                      {fileLeaveType === "Wellness Leave" || fileLeaveType === "USE Leave" ? fileLeaveType : ""}
                    </div>
                  </div>
                </td>
                <td className="w-1/2 p-1 align-top">
                  <div className="font-bold mb-1">6.B DETAILS OF LEAVE</div>

                  <div className="italic text-[8pt] mb-0.5">In case of Vacation/Special Privilege Leave:</div>
                  <div className="ml-4 space-y-1 mb-2">
                    <div className="flex items-end gap-1.5 w-full">
                      <div className="w-3.5 h-3.5 min-w-[14px] min-h-[14px] flex-shrink-0 border border-black flex items-center justify-center font-bold mb-0.5">
                        {(fileLeaveType === 'Vacation Leave' || fileLeaveType === 'Special Privilege Leave') && leaveDetailType === 'Within the Philippines' ? '✓' : ''}
                      </div>
                      <div className="whitespace-nowrap mr-2 pb-0.5">Within the Philippines</div>
                      <div className="border-b border-black flex-1 text-center pb-0.5 min-h-[20px]">
                        {leaveDetailType === 'Within the Philippines' ? leaveDetailSpecify : ''}
                      </div>
                    </div>
                    <div className="flex items-end gap-1.5 w-full">
                      <div className="w-3.5 h-3.5 min-w-[14px] min-h-[14px] flex-shrink-0 border border-black flex items-center justify-center font-bold mb-0.5">
                        {(fileLeaveType === 'Vacation Leave' || fileLeaveType === 'Special Privilege Leave') && leaveDetailType === 'Abroad (Specify)' ? '✓' : ''}
                      </div>
                      <div className="whitespace-nowrap mr-2 pb-0.5">Abroad (Specify)</div>
                      <div className="border-b border-black flex-1 text-center pb-0.5 min-h-[20px]">
                        {leaveDetailType === 'Abroad (Specify)' ? leaveDetailSpecify : ''}
                      </div>
                    </div>
                  </div>

                  <div className="italic text-[8pt] mb-0.5">In case of Sick Leave:</div>
                  <div className="ml-4 space-y-1 mb-2">
                    <div className="flex items-end gap-1.5 w-full">
                      <div className="w-3.5 h-3.5 min-w-[14px] min-h-[14px] flex-shrink-0 border border-black flex items-center justify-center font-bold mb-0.5">
                        {fileLeaveType === 'Sick Leave' && leaveDetailType === 'In Hospital (Specify Illness)' ? '✓' : ''}
                      </div>
                      <div className="whitespace-nowrap mr-2 pb-0.5">In Hospital (Specify Illness)</div>
                      <div className="border-b border-black flex-1 text-center pb-0.5 min-h-[20px]">
                        {leaveDetailType === 'In Hospital (Specify Illness)' ? leaveDetailSpecify : ''}
                      </div>
                    </div>
                    <div className="flex items-end gap-1.5 w-full">
                      <div className="w-3.5 h-3.5 min-w-[14px] min-h-[14px] flex-shrink-0 border border-black flex items-center justify-center font-bold mb-0.5">
                        {fileLeaveType === 'Sick Leave' && leaveDetailType === 'Out Patient (Specify Illness)' ? '✓' : ''}
                      </div>
                      <div className="whitespace-nowrap mr-2 pb-0.5">Out Patient (Specify Illness)</div>
                      <div className="border-b border-black flex-1 text-center pb-0.5 min-h-[20px]">
                        {leaveDetailType === 'Out Patient (Specify Illness)' ? leaveDetailSpecify : ''}
                      </div>
                    </div>
                  </div>

                  <div className="italic text-[8pt] mb-0.5 whitespace-nowrap">In case of Special Leave Benefits for Women:</div>
                  <div className="ml-4 mb-2">
                    <span className="whitespace-nowrap">(Specify Illness) __________________________________</span>
                  </div>

                  <div className="italic text-[8pt] mb-0.5 whitespace-nowrap">In case of Study Leave:</div>
                  <div className="ml-4 space-y-1 mb-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 min-w-[14px] min-h-[14px] flex-shrink-0 border border-black flex items-center justify-center"></div>
                      <span className="whitespace-nowrap">Completion of Master's Degree</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 min-w-[14px] min-h-[14px] flex-shrink-0 border border-black flex items-center justify-center"></div>
                      <span className="whitespace-nowrap">BAR/Board Examination Review</span>
                    </div>
                  </div>

                  <div className="italic text-[8pt] mb-0.5 whitespace-nowrap">Other purpose:</div>
                  <div className="ml-4 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 min-w-[14px] min-h-[14px] flex-shrink-0 border border-black flex items-center justify-center"></div>
                      <span className="whitespace-nowrap">Monetization of Leave Credits</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 min-w-[14px] min-h-[14px] flex-shrink-0 border border-black flex items-center justify-center"></div>
                      <span className="whitespace-nowrap">Terminal Leave</span>
                    </div>
                  </div>

                </td>
              </tr>
              <tr className="border-t border-black">
                <td className="w-1/2 border-r border-black p-1 align-top">
                  <div className="font-bold mb-1">6.C NUMBER OF WORKING DAYS APPLIED FOR</div>
                  <div className="border-b border-black font-bold text-center py-0.5 mb-1">
                    {requestedDays ? `${requestedDays} ${parseFloat(requestedDays) === 1 ? 'day' : 'days'}` : ' '}
                  </div>
                  <div className="mb-1">INCLUSIVE DATES</div>
                  <div className="border-b border-black font-bold text-center py-0.5 min-h-[24px]">
                    {formData.inclusiveDates || ' '}
                  </div>
                </td>
                <td className="w-1/2 p-1 align-top">
                  <div className="font-bold mb-2">6.D COMMUTATION</div>
                  <div className="flex justify-center gap-8 mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 min-w-[16px] min-h-[16px] flex-shrink-0 border border-black flex items-center justify-center font-bold text-[10pt]">✓</div>
                      <span>Not Requested</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 min-w-[16px] min-h-[16px] flex-shrink-0 border border-black flex items-center justify-center"></div>
                      <span>Requested</span>
                    </div>
                  </div>
                  <div className="mt-8 text-center">
                    <div className="border-b border-black w-3/4 mx-auto mb-1 h-[20px]"></div>
                    <div className="text-[9pt]">(Signature of Applicant)</div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Section 7 */}
        <div className="border border-black mb-0 text-sm">
          <div className="border-b border-black bg-gray-100 p-1 text-center font-bold tracking-wide">
            7. DETAILS OF ACTION ON APPLICATION
          </div>

          <table className="w-full border-collapse">
            <tbody>
              <tr>
                <td className="w-1/2 border-r border-black p-1 align-top">
                  <div className="font-bold mb-1">7.A CERTIFICATION OF LEAVE CREDITS</div>
                  <div className="mb-2">As of <span className="border-b border-black px-2 inline-block min-w-[150px] text-center">{formData.asOfDate || ''}</span></div>
                  <table className="w-full border-collapse border border-black mb-6 text-[9pt]">
                    <thead>
                      <tr>
                        <th className="border border-black p-1 bg-gray-50 w-2/5"></th>
                        <th className="border border-black p-1 bg-gray-50 font-normal w-[30%]">Vacation Leave</th>
                        <th className="border border-black p-1 bg-gray-50 font-normal w-[30%]">Sick Leave</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-black p-1">Total Earned</td>
                        <td className="border border-black p-1 h-6 text-center">{userBalances?.vl_balance?.toFixed(2) ?? ' '}</td>
                        <td className="border border-black p-1 h-6 text-center">{userBalances?.sl_balance?.toFixed(2) ?? ' '}</td>
                      </tr>
                      <tr>
                        <td className="border border-black p-1 whitespace-nowrap">Less this application</td>
                        <td className="border border-black p-1 h-6 text-center">{vlLess}</td>
                        <td className="border border-black p-1 h-6 text-center">{slLess}</td>
                      </tr>
                      <tr>
                        <td className="border border-black p-1">Balance</td>
                        <td className="border border-black p-1 h-6 text-center">{vlBalanceAfter}</td>
                        <td className="border border-black p-1 h-6 text-center">{slBalanceAfter}</td>
                      </tr>
                    </tbody>
                  </table>
                </td>
                <td className="w-1/2 p-1 align-top">
                  <div className="font-bold mb-2">7.B RECOMMENDATION</div>
                  <div className="ml-4 space-y-3 mb-6">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 min-w-[16px] min-h-[16px] flex-shrink-0 border border-black flex items-center justify-center font-bold"></div>
                      <span>For approval</span>
                    </div>
                    <div className="flex flex-col gap-1 w-full pr-4">
                      <div className="flex items-end gap-2 w-full">
                        <div className="w-4 h-4 min-w-[16px] min-h-[16px] flex-shrink-0 border border-black flex items-center justify-center font-bold mb-0.5"></div>
                        <div className="flex flex-1 items-end">
                          <span className="whitespace-nowrap mr-2">For disapproval due to</span>
                          <span className="border-b border-black flex-1 h-5"></span>
                        </div>
                      </div>
                      <div className="border-b border-black w-full h-5"></div>
                      <div className="border-b border-black w-full h-5"></div>
                    </div>
                  </div>
                </td>
              </tr>
              <tr>
                <td className="w-1/2 border-r border-black p-1 align-bottom pt-4">
                  <div className="text-center flex flex-col items-center">
                    <div className="font-bold text-[11pt]">{signatories?.hr?.name || 'DONAH GRACE C. CAPULAC'}</div>
                    <div className="text-[9pt] border-b border-black w-[90%] pb-0.5">{signatories?.hr?.position || 'HR Designate'}</div>
                    <div className="text-[9pt] mt-0.5">(Authorized Officer)</div>
                  </div>
                </td>
                <td className="w-1/2 p-1 align-bottom pt-4">
                  <div className="text-center flex flex-col items-center">
                    <div className="font-bold text-[11pt] min-h-[24px]">
                      {formData?.position?.toLowerCase().includes('chief statistical') ? '' : ((signatories?.supervisor?.name && signatories.supervisor.name.trim() !== '') ? signatories.supervisor.name : 'RANDOLF M. LADERAS')}
                    </div>
                    <div className="text-[9pt] border-b border-black w-[90%] pb-0.5 min-h-[20px]">
                      {formData?.position?.toLowerCase().includes('chief statistical') ? '' : ((signatories?.supervisor?.position && signatories.supervisor.position.trim() !== '') ? signatories.supervisor.position : 'Supervising Statistical Specialist')}
                    </div>
                    <div className="text-[9pt] mt-0.5 min-h-[20px]">(Authorized Officer)</div>
                  </div>
                </td>
              </tr>
              <tr className="border-t border-black">
                <td className="w-1/2 border-r border-black p-1 align-top pb-1">
                  <div className="font-bold mb-2">7.C APPROVED FOR:</div>
                  <div className="ml-4 space-y-1 mb-2 text-[9pt]">
                    <div><span className="border-b border-black inline-block text-center w-24">{fileLeaveType === 'Vacation Leave' ? requestedDays : '  '}</span> days with pay</div>
                    <div><span className="border-b border-black inline-block w-24"></span> days without pay</div>
                    <div><span className="border-b border-black inline-block w-24"></span> others (Specify)</div>
                  </div>
                </td>
                <td className="w-1/2 p-1 align-top pr-6 pb-1">
                  <div className="font-bold mb-2">7.D DISAPPROVED DUE TO:</div>
                  <div className="border-b border-black w-full h-5"></div>
                  <div className="border-b border-black w-full h-5"></div>
                  <div className="border-b border-black w-full h-5"></div>
                </td>
              </tr>
              <tr>
                <td colSpan="2" className="h-4"></td>
              </tr>
            </tbody>
          </table>

          <div className="pb-2 text-center max-w-md mx-auto">
            <div className="font-bold text-[11pt]">{signatories?.chief?.name || 'MARIBEL M. DALAYDAY'}</div>
            <div className="text-[9pt] border-b border-black w-full pb-0.5">{signatories?.chief?.position || 'Chief Statistical Specialist'}</div>
            <div className="text-[10pt] mt-0.5">(Authorized Official)</div>
          </div>
        </div>
      </div>
    </>
  );
}
