import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image, Font } from '@react-pdf/renderer';

// Note: To use custom fonts you need to register them, but Helvetica is default and looks okay for forms.
// We'll use Times-Roman where it requires serif.

const styles = StyleSheet.create({
  page: {
    padding: 20,
    paddingTop: 10,
    paddingBottom: 10,
    fontFamily: 'Helvetica',
    fontSize: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  formNo: {
    fontSize: 7,
    fontStyle: 'italic',
  },
  logoContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 40,
    marginBottom: 5,
  },
  logo: {
    width: 50,
    height: 50,
  },
  logoBagong: {
    width: 60,
    height: 60,
  },
  headerTextContainer: {
    alignItems: 'center',
    flex: 1,
  },
  republicText: {
    fontWeight: 'bold',
    fontSize: 9,
  },
  psaText: {
    fontFamily: 'Times-Roman',
    fontWeight: 'bold',
    fontSize: 10,
    letterSpacing: 1,
    marginTop: 2,
  },
  addressText: {
    fontSize: 7,
    marginTop: 1,
  },
  titleText: {
    fontWeight: 'bold',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 5,
    marginBottom: 5,
    letterSpacing: 1,
  },
  table: {
    borderWidth: 1,
    borderColor: '#000',
    marginBottom: 5,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#000',
  },
  rowNoBorderBottom: {
    flexDirection: 'row',
  },
  col: {
    borderRightWidth: 1,
    borderColor: '#000',
    padding: 3,
  },
  colNoBorderRight: {
    padding: 3,
  },
  flexRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    marginRight: 5,
  },
  valueLine: {
    borderBottomWidth: 1,
    borderColor: '#000',
    textAlign: 'center',
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  valueLineRow: {
    borderBottomWidth: 1,
    borderColor: '#000',
    flex: 1,
    textAlign: 'center',
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  valueContainer: {
    borderBottomWidth: 1,
    borderColor: '#000',
    marginTop: 2,
    paddingBottom: 2,
  },
  valueText: {
    textAlign: 'center',
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  bold: {
    fontWeight: 'bold',
  },
  sectionTitle: {
    backgroundColor: '#f3f4f6',
    borderBottomWidth: 1,
    borderColor: '#000',
    padding: 3,
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 9,
  },
  checkbox: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: '#000',
    marginRight: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxText: {
    fontSize: 8,
    fontWeight: 'bold',
    marginTop: -1,
  },
  smallItalic: {
    fontSize: 6,
    fontStyle: 'italic',
  },
  mb: {
    marginBottom: 4,
  },
  mt: {
    marginTop: 4,
  },
  line: {
    borderBottomWidth: 1,
    borderColor: '#000',
  }
});

export default function CscForm6Pdf({ formData, userBalances, signatories }) {
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
    inclusiveDates = '',
    asOfDate = ''
  } = formData || {};

  const isChecked = (type) => (fileLeaveType === type || (type === 'Mandatory/Forced Leave' && (fileLeaveType === 'Forced Leave' || fileLeaveType === 'Mandatory/Forced Leave'))) ? 'X' : '';

  const parsedDays = parseFloat(requestedDays) || 0;
  const isVL = fileLeaveType === 'Vacation Leave' || fileLeaveType === 'Mandatory/Forced Leave' || fileLeaveType === 'Forced Leave';
  const isSL = fileLeaveType === 'Sick Leave';
  
  const vlLess = isVL && parsedDays > 0 ? parsedDays.toFixed(2) : '';
  const slLess = isSL && parsedDays > 0 ? parsedDays.toFixed(2) : '';
  
  const vlBalanceAfter = userBalances?.vl_balance != null 
    ? (userBalances.vl_balance - (isVL ? parsedDays : 0)).toFixed(2) 
    : ' ';
    
  const slBalanceAfter = userBalances?.sl_balance != null 
    ? (userBalances.sl_balance - (isSL ? parsedDays : 0)).toFixed(2) 
    : ' ';

  const formattedSalary = salary ? (isNaN(parseFloat(salary.toString().replace(/,/g, ''))) ? salary : parseFloat(salary.toString().replace(/,/g, '')).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) : '';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        <View style={styles.header}>
          <Text style={styles.formNo}>Civil Service Form No. 6{'\n'}Revised 2020</Text>
        </View>

        <View style={styles.logoContainer}>
          {/* Note: In React PDF, relative images must be accessible. Using public absolute URL if it doesn't work */}
          <Image src="/PSA.png" style={styles.logo} />
          <View style={styles.headerTextContainer}>
            <Text style={styles.republicText}>Republic of the Philippines</Text>
            <Text style={styles.psaText}>PHILIPPINE STATISTICS AUTHORITY</Text>
            <Text style={styles.addressText}>PSA Complex, East Avenue, Diliman, Quezon City 1100</Text>
          </View>
          <Image src="/Bagong.png" style={styles.logoBagong} />
        </View>

        <Text style={styles.titleText}>APPLICATION FOR LEAVE</Text>

        <View style={styles.table}>
          <View style={styles.row}>
            <View style={[styles.col, { width: '33%' }]}>
              <Text>1. OFFICE/DEPARTMENT</Text>
              <View style={styles.valueContainer}>
                <Text style={styles.valueText}>{officeDepartment}</Text>
              </View>
            </View>
            <View style={[styles.colNoBorderRight, { width: '67%' }]}>
              <View style={styles.flexRow}>
                <Text style={styles.label}>2. NAME:</Text>
                <Text style={styles.valueLineRow}>(Last)</Text>
                <Text style={styles.valueLineRow}>(First)</Text>
                <Text style={styles.valueLineRow}>(Middle)</Text>
              </View>
              <View style={[styles.flexRow, styles.mt]}>
                <Text style={[styles.label, { color: '#FFF' }]}>2. NAME:</Text>
                <Text style={styles.valueLineRow}>{nameParts.lastName}</Text>
                <Text style={styles.valueLineRow}>{nameParts.firstName}</Text>
                <Text style={styles.valueLineRow}>{nameParts.middleName}</Text>
              </View>
            </View>
          </View>
          
          <View style={styles.rowNoBorderBottom}>
            <View style={[styles.col, { width: '33%' }]}>
              <Text>3. DATE OF FILING</Text>
              <View style={styles.valueContainer}>
                <Text style={styles.valueText}>{dateFiled}</Text>
              </View>
            </View>
            <View style={[styles.col, { width: '33%' }]}>
              <Text>4. POSITION</Text>
              <View style={styles.valueContainer}>
                <Text style={styles.valueText}>{position}</Text>
              </View>
            </View>
            <View style={[styles.colNoBorderRight, { width: '34%' }]}>
              <Text>5. SALARY</Text>
              <View style={styles.valueContainer}>
                <Text style={styles.valueText}>{formattedSalary}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.table}>
          <Text style={styles.sectionTitle}>6. DETAILS OF APPLICATION</Text>
          <View style={styles.row}>
            <View style={[styles.col, { width: '50%' }]}>
              <Text style={[styles.bold, styles.mb]}>6.A TYPE OF LEAVE TO BE AVAILED OF</Text>
              
              <View style={[styles.flexRow, styles.mb]}>
                <View style={styles.checkbox}><Text style={styles.checkboxText}>{isChecked("Vacation Leave")}</Text></View>
                <Text>Vacation Leave <Text style={styles.smallItalic}>(Sec. 51, Rule XVI, Omnibus Rules Implementing E.O. No. 292)</Text></Text>
              </View>
              <View style={[styles.flexRow, styles.mb]}>
                <View style={styles.checkbox}><Text style={styles.checkboxText}>{isChecked("Mandatory/Forced Leave")}</Text></View>
                <Text>Mandatory/Forced Leave <Text style={styles.smallItalic}>(Sec. 25, Rule XVI)</Text></Text>
              </View>
              <View style={[styles.flexRow, styles.mb]}>
                <View style={styles.checkbox}><Text style={styles.checkboxText}>{isChecked("Sick Leave")}</Text></View>
                <Text>Sick Leave <Text style={styles.smallItalic}>(Sec. 43, Rule XVI)</Text></Text>
              </View>
              <View style={[styles.flexRow, styles.mb]}>
                <View style={styles.checkbox}><Text style={styles.checkboxText}></Text></View>
                <Text>Maternity Leave <Text style={styles.smallItalic}>(R.A. No. 11210)</Text></Text>
              </View>
              <View style={[styles.flexRow, styles.mb]}>
                <View style={styles.checkbox}><Text style={styles.checkboxText}></Text></View>
                <Text>Paternity Leave <Text style={styles.smallItalic}>(R.A. No. 8187)</Text></Text>
              </View>
              <View style={[styles.flexRow, styles.mb]}>
                <View style={styles.checkbox}><Text style={styles.checkboxText}>{isChecked("Special Privilege Leave")}</Text></View>
                <Text>Special Privilege Leave <Text style={styles.smallItalic}>(Sec. 21, Rule XVI)</Text></Text>
              </View>
              <View style={[styles.flexRow, styles.mb]}>
                <View style={styles.checkbox}><Text style={styles.checkboxText}></Text></View>
                <Text>Solo Parent Leave <Text style={styles.smallItalic}>(RA No. 8972)</Text></Text>
              </View>
              <View style={[styles.flexRow, styles.mb]}>
                <View style={styles.checkbox}><Text style={styles.checkboxText}></Text></View>
                <Text>Study Leave <Text style={styles.smallItalic}>(Sec. 68, Rule XVI)</Text></Text>
              </View>
              <View style={[styles.flexRow, styles.mb]}>
                <View style={styles.checkbox}><Text style={styles.checkboxText}></Text></View>
                <Text>10-Day VAWC Leave <Text style={styles.smallItalic}>(RA No. 9262)</Text></Text>
              </View>
              <View style={[styles.flexRow, styles.mb]}>
                <View style={styles.checkbox}><Text style={styles.checkboxText}></Text></View>
                <Text>Rehabilitation Privilege <Text style={styles.smallItalic}>(Sec. 55, Rule XVI)</Text></Text>
              </View>
              <View style={[styles.flexRow, styles.mb]}>
                <View style={styles.checkbox}><Text style={styles.checkboxText}></Text></View>
                <Text>Special Leave Benefits for Women <Text style={styles.smallItalic}>(RA No. 9710)</Text></Text>
              </View>
              <View style={[styles.flexRow, styles.mb]}>
                <View style={styles.checkbox}><Text style={styles.checkboxText}></Text></View>
                <Text>Special Emergency (Calamity) Leave <Text style={styles.smallItalic}>(CSC MC No. 2, s. 2012)</Text></Text>
              </View>
              <View style={[styles.flexRow, styles.mb]}>
                <View style={styles.checkbox}><Text style={styles.checkboxText}></Text></View>
                <Text>Adoption Leave <Text style={styles.smallItalic}>(R.A. No. 8552)</Text></Text>
              </View>
              <View style={[styles.flexRow, styles.mb]}>
                <View style={styles.checkbox}><Text style={styles.checkboxText}>{isChecked("Wellness Leave") || isChecked("USE Leave") ? 'X' : ''}</Text></View>
                <Text>Others:</Text>
              </View>
              <Text style={[styles.valueLine, { marginLeft: 20 }]}>
                {fileLeaveType === "Wellness Leave" || fileLeaveType === "USE Leave" ? fileLeaveType : ""}
              </Text>
            </View>
            
            <View style={[styles.colNoBorderRight, { width: '50%' }]}>
              <Text style={[styles.bold, styles.mb]}>6.B DETAILS OF LEAVE</Text>
              
              <Text style={[styles.smallItalic, styles.mb]}>In case of Vacation/Special Privilege Leave/Mandatory Leave:</Text>
              <View style={{ marginLeft: 10 }}>
                <View style={[styles.flexRow, styles.mb]}>
                  <View style={styles.checkbox}>
                    <Text style={styles.checkboxText}>{(fileLeaveType === 'Vacation Leave' || fileLeaveType === 'Special Privilege Leave' || fileLeaveType === 'Forced Leave' || fileLeaveType === 'Mandatory/Forced Leave') && leaveDetailType === 'Within the Philippines' ? 'X' : ''}</Text>
                  </View>
                  <Text style={styles.label}>Within the Philippines</Text>
                  <Text style={styles.valueLine}>{leaveDetailType === 'Within the Philippines' ? leaveDetailSpecify : ''}</Text>
                </View>
                <View style={[styles.flexRow, styles.mb]}>
                  <View style={styles.checkbox}>
                    <Text style={styles.checkboxText}>{(fileLeaveType === 'Vacation Leave' || fileLeaveType === 'Special Privilege Leave' || fileLeaveType === 'Forced Leave' || fileLeaveType === 'Mandatory/Forced Leave') && leaveDetailType === 'Abroad (Specify)' ? 'X' : ''}</Text>
                  </View>
                  <Text style={styles.label}>Abroad (Specify)</Text>
                  <Text style={styles.valueLine}>{leaveDetailType === 'Abroad (Specify)' ? leaveDetailSpecify : ''}</Text>
                </View>
              </View>

              <Text style={[styles.smallItalic, styles.mt, styles.mb]}>In case of Sick Leave:</Text>
              <View style={{ marginLeft: 10 }}>
                <View style={[styles.flexRow, styles.mb]}>
                  <View style={styles.checkbox}>
                    <Text style={styles.checkboxText}>{fileLeaveType === 'Sick Leave' && leaveDetailType === 'In Hospital (Specify Illness)' ? 'X' : ''}</Text>
                  </View>
                  <Text style={styles.label}>In Hospital (Specify Illness)</Text>
                  <Text style={styles.valueLine}>{leaveDetailType === 'In Hospital (Specify Illness)' ? leaveDetailSpecify : ''}</Text>
                </View>
                <View style={[styles.flexRow, styles.mb]}>
                  <View style={styles.checkbox}>
                    <Text style={styles.checkboxText}>{fileLeaveType === 'Sick Leave' && leaveDetailType === 'Out Patient (Specify Illness)' ? 'X' : ''}</Text>
                  </View>
                  <Text style={styles.label}>Out Patient (Specify Illness)</Text>
                  <Text style={styles.valueLine}>{leaveDetailType === 'Out Patient (Specify Illness)' ? leaveDetailSpecify : ''}</Text>
                </View>
              </View>

              <Text style={[styles.smallItalic, styles.mt, styles.mb]}>In case of Special Leave Benefits for Women:</Text>
              <View style={{ marginLeft: 10, flexDirection: 'row' }}>
                <Text style={styles.label}>(Specify Illness)</Text>
                <Text style={styles.valueLine}></Text>
              </View>

              <Text style={[styles.smallItalic, styles.mt, styles.mb]}>In case of Study Leave:</Text>
              <View style={{ marginLeft: 10 }}>
                <View style={[styles.flexRow, styles.mb]}>
                  <View style={styles.checkbox}></View>
                  <Text>Completion of Master's Degree</Text>
                </View>
                <View style={[styles.flexRow, styles.mb]}>
                  <View style={styles.checkbox}></View>
                  <Text>BAR/Board Examination Review</Text>
                </View>
              </View>

              <Text style={[styles.smallItalic, styles.mt, styles.mb]}>Other purpose:</Text>
              <View style={{ marginLeft: 10 }}>
                <View style={[styles.flexRow, styles.mb]}>
                  <View style={styles.checkbox}></View>
                  <Text>Monetization of Leave Credits</Text>
                </View>
                <View style={[styles.flexRow, styles.mb]}>
                  <View style={styles.checkbox}></View>
                  <Text>Terminal Leave</Text>
                </View>
              </View>
            </View>
          </View>
          
          <View style={styles.rowNoBorderBottom}>
            <View style={[styles.col, { width: '50%' }]}>
              <Text style={[styles.bold, styles.mb]}>6.C NUMBER OF WORKING DAYS APPLIED FOR</Text>
              <Text style={[styles.valueLine, styles.mb]}>
                {requestedDays ? `${requestedDays} ${parseFloat(requestedDays) === 1 ? 'day' : 'days'}` : ' '}
              </Text>
              <Text style={styles.mb}>INCLUSIVE DATES</Text>
              <Text style={styles.valueLine}>
                {inclusiveDates || ' '}
              </Text>
            </View>
            <View style={[styles.colNoBorderRight, { width: '50%' }]}>
              <Text style={[styles.bold, styles.mb]}>6.D COMMUTATION</Text>
              <View style={[styles.flexRow, { justifyContent: 'space-around', marginVertical: 10 }]}>
                <View style={styles.flexRow}>
                  <View style={styles.checkbox}><Text style={styles.checkboxText}>X</Text></View>
                  <Text>Not Requested</Text>
                </View>
                <View style={styles.flexRow}>
                  <View style={styles.checkbox}></View>
                  <Text>Requested</Text>
                </View>
              </View>
              <View style={{ alignItems: 'center', marginTop: 15 }}>
                <View style={[styles.line, { width: '75%', marginBottom: 2 }]} />
                <Text style={{ fontSize: 7 }}>(Signature of Applicant)</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.table}>
          <Text style={styles.sectionTitle}>7. DETAILS OF ACTION ON APPLICATION</Text>
          <View style={styles.row}>
            <View style={[styles.col, { width: '50%' }]}>
              <Text style={[styles.bold, styles.mb]}>7.A CERTIFICATION OF LEAVE CREDITS</Text>
              <View style={[styles.flexRow, styles.mb]}>
                <Text style={styles.label}>As of</Text>
                <Text style={styles.valueLine}>{asOfDate || ''}</Text>
              </View>
              
              <View style={[styles.table, styles.mt]}>
                <View style={styles.row}>
                  <View style={[styles.col, { width: '40%' }]}><Text></Text></View>
                  <View style={[styles.col, { width: '30%', alignItems: 'center' }]}><Text>Vacation Leave</Text></View>
                  <View style={[styles.colNoBorderRight, { width: '30%', alignItems: 'center' }]}><Text>Sick Leave</Text></View>
                </View>
                <View style={styles.row}>
                  <View style={[styles.col, { width: '40%' }]}><Text>Total Earned</Text></View>
                  <View style={[styles.col, { width: '30%', alignItems: 'center' }]}><Text>{userBalances?.vl_balance?.toFixed(2) ?? ' '}</Text></View>
                  <View style={[styles.colNoBorderRight, { width: '30%', alignItems: 'center' }]}><Text>{userBalances?.sl_balance?.toFixed(2) ?? ' '}</Text></View>
                </View>
                <View style={styles.row}>
                  <View style={[styles.col, { width: '40%' }]}><Text>Less this application</Text></View>
                  <View style={[styles.col, { width: '30%', alignItems: 'center' }]}><Text>{vlLess}</Text></View>
                  <View style={[styles.colNoBorderRight, { width: '30%', alignItems: 'center' }]}><Text>{slLess}</Text></View>
                </View>
                <View style={styles.rowNoBorderBottom}>
                  <View style={[styles.col, { width: '40%' }]}><Text>Balance</Text></View>
                  <View style={[styles.col, { width: '30%', alignItems: 'center' }]}><Text>{vlBalanceAfter}</Text></View>
                  <View style={[styles.colNoBorderRight, { width: '30%', alignItems: 'center' }]}><Text>{slBalanceAfter}</Text></View>
                </View>
              </View>
            </View>

            <View style={[styles.colNoBorderRight, { width: '50%' }]}>
              <Text style={[styles.bold, styles.mb]}>7.B RECOMMENDATION</Text>
              <View style={{ marginLeft: 10, marginTop: 10 }}>
                <View style={[styles.flexRow, styles.mb]}>
                  <View style={styles.checkbox}></View>
                  <Text>For approval</Text>
                </View>
                <View style={[styles.flexRow, styles.mb, styles.mt]}>
                  <View style={styles.checkbox}></View>
                  <Text style={styles.label}>For disapproval due to</Text>
                  <Text style={styles.valueLine}></Text>
                </View>
                <View style={[styles.line, styles.mt, { width: '100%', marginBottom: 5 }]} />
                <View style={[styles.line, styles.mt, { width: '100%', marginBottom: 5 }]} />
              </View>
            </View>
          </View>
          
          <View style={styles.row}>
            <View style={[styles.col, { width: '50%', alignItems: 'center', paddingTop: 30 }]}>
              <Text style={[styles.bold, { fontSize: 10 }]}>{signatories?.hr?.name || 'DONAH GRACE C. CAPULAC'}</Text>
              <View style={[styles.line, { width: '80%', marginVertical: 2 }]} />
              <Text style={{ fontSize: 8 }}>{signatories?.hr?.position || 'HR Designate'}</Text>
              <Text style={{ fontSize: 8 }}>(Authorized Officer)</Text>
            </View>
            <View style={[styles.colNoBorderRight, { width: '50%', alignItems: 'center', paddingTop: 30 }]}>
              <Text style={[styles.bold, { fontSize: 10 }]}>
                {formData?.position?.toLowerCase().includes('chief statistical') ? ' ' : ((signatories?.supervisor?.name && signatories.supervisor.name.trim() !== '') ? signatories.supervisor.name : 'RANDOLF M. LADERAS')}
              </Text>
              <View style={[styles.line, { width: '80%', marginVertical: 2 }]} />
              <Text style={{ fontSize: 8 }}>
                {formData?.position?.toLowerCase().includes('chief statistical') ? ' ' : ((signatories?.supervisor?.position && signatories.supervisor.position.trim() !== '') ? signatories.supervisor.position : 'Supervising Statistical Specialist')}
              </Text>
              <Text style={{ fontSize: 8 }}>(Authorized Officer)</Text>
            </View>
          </View>
          
          <View style={styles.rowNoBorderBottom}>
            <View style={[styles.col, { width: '50%' }]}>
              <Text style={[styles.bold, styles.mb]}>7.C APPROVED FOR:</Text>
              <View style={{ marginLeft: 10 }}>
                <View style={[styles.flexRow, styles.mb]}>
                  <View style={{ width: 45, borderBottomWidth: 1, borderColor: '#000', marginRight: 6, alignItems: 'center', justifyContent: 'center', minHeight: 12 }}>
                    <Text style={{ fontSize: 8, fontWeight: 'bold' }}>
                      {requestedDays || ''}
                    </Text>
                  </View>
                  <Text>days with pay</Text>
                </View>
                <View style={[styles.flexRow, styles.mb]}>
                  <View style={{ width: 45, borderBottomWidth: 1, borderColor: '#000', marginRight: 6, minHeight: 12 }} />
                  <Text>days without pay</Text>
                </View>
                <View style={[styles.flexRow, styles.mb]}>
                  <View style={{ width: 45, borderBottomWidth: 1, borderColor: '#000', marginRight: 6, minHeight: 12 }} />
                  <Text>others (Specify)</Text>
                </View>
              </View>
            </View>
            <View style={[styles.colNoBorderRight, { width: '50%' }]}>
              <Text style={[styles.bold, styles.mb]}>7.D DISAPPROVED DUE TO:</Text>
              <View style={[styles.line, styles.mt, { width: '100%', marginBottom: 8 }]} />
              <View style={[styles.line, styles.mt, { width: '100%', marginBottom: 8 }]} />
              <View style={[styles.line, styles.mt, { width: '100%', marginBottom: 8 }]} />
            </View>
          </View>
        </View>

        <View style={{ alignItems: 'center', marginTop: 25 }}>
          <Text style={[styles.bold, { fontSize: 10 }]}>{signatories?.chief?.name || 'MARIBEL M. DALAYDAY'}</Text>
          <View style={[styles.line, { width: '40%', marginVertical: 2 }]} />
          <Text style={{ fontSize: 8 }}>{signatories?.chief?.position || 'Chief Statistical Specialist'}</Text>
          <Text style={{ fontSize: 8 }}>(Authorized Official)</Text>
        </View>

      </Page>
    </Document>
  );
}
