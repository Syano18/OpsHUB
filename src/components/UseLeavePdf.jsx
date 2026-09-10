import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontFamily: 'Helvetica',
    fontSize: 9,
    lineHeight: 1.2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  logoPsa: {
    width: 65,
    height: 65,
    objectFit: 'contain',
  },
  logoUse: {
    width: 75,
    height: 65,
    objectFit: 'contain',
  },
  headerTextContainer: {
    alignItems: 'center',
    flex: 1,
  },
  headerText1: {
    fontWeight: 'bold',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerText2: {
    fontWeight: 'bold',
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title1: {
    fontWeight: 'bold',
    fontSize: 12.5,
  },
  title2: {
    fontWeight: 'bold',
    fontSize: 12.5,
  },
  title3: {
    fontStyle: 'italic',
    fontSize: 10,
    marginTop: 5,
  },
  table: {
    borderWidth: 1.5,
    borderColor: '#000',
    flexDirection: 'column',
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    borderColor: '#000',
  },
  rowNoBorder: {
    flexDirection: 'row',
  },
  col: {
    borderRightWidth: 1.5,
    borderColor: '#000',
    padding: 4,
  },
  colNoBorder: {
    padding: 4,
  },
  textSmall: {
    fontSize: 9,
  },
  textSmaller: {
    fontSize: 8,
  },
  bold: {
    fontWeight: 'bold',
  },
  italic: {
    fontStyle: 'italic',
  },
  uppercase: {
    textTransform: 'uppercase',
  },
  center: {
    textAlign: 'center',
  },
  flexRow: {
    flexDirection: 'row',
  },
  flexRowItemsEnd: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  underline: {
    borderBottomWidth: 1.5,
    borderColor: '#000',
    textAlign: 'center',
    fontWeight: 'bold',
    flex: 1,
    textTransform: 'uppercase',
    marginLeft: 4,
    paddingBottom: 2,
  },
  underlineContainer: {
    borderBottomWidth: 1.5,
    borderColor: '#000',
    flex: 1,
    marginLeft: 4,
    paddingBottom: 1,
  },
  sectionTitle: {
    borderBottomWidth: 1.5,
    borderTopWidth: 1.5,
    borderColor: '#000',
    paddingVertical: 4,
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 10,
  },
  checkbox: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    fontSize: 8,
    fontWeight: 'bold',
    marginTop: -1,
  },
  mb1: { marginBottom: 4 },
  mb2: { marginBottom: 8 },
  mt1: { marginTop: 4 },
  mt2: { marginTop: 8 },
  gap1: { marginRight: 8 },
  signatureLine: {
    borderBottomWidth: 1.5,
    borderColor: '#000',
    marginTop: 30,
    width: '75%',
    alignSelf: 'center',
  },
  signatureLineSmall: {
    borderBottomWidth: 1,
    borderColor: '#000',
    width: '70%',
    alignSelf: 'center',
    marginTop: 20,
  },
  signatureLineAction: {
    borderBottomWidth: 1,
    borderColor: '#000',
    width: 60,
  },
  underlineBox: {
    borderBottomWidth: 1.5,
    borderColor: '#000',
    height: 20,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 1,
    width: '100%',
  },
});

export default function UseLeavePdf({ formData, signatories = {} }) {
  const {
    officeDepartment = '',
    nameParts = { lastName: '', firstName: '', middleName: '' },
    dateFiled = '',
    position = '',
    salaryGrade = '',
    inclusiveDates = '',
    requestedDays = '',
    leaveDetailSpecify = '',
  } = formData || {};

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        {/* Header */}
        <View style={styles.header}>
          <Image src="/PSA.png" style={styles.logoPsa} />
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerText1}>Philippine Statistics Authority</Text>
            <Text style={styles.headerText2}>Union of Statistics Employees</Text>
          </View>
          <Image src="/Use.png" style={styles.logoUse} />
        </View>

        {/* Title */}
        <View style={styles.titleContainer}>
          <Text style={styles.title1}>APPLICATION FOR NON-CUMULATIVE AND COMMUTATIVE</Text>
          <Text style={styles.title2}>COMPENSATORY DAY OFF</Text>
          <Text style={styles.title3}>(Per 2025 - 2029 Collective Negotiation Agreement)</Text>
        </View>

        {/* Outer Table */}
        <View style={styles.table}>
          
          {/* Row 1 */}
          <View style={[styles.row, { height: 45 }]}>
            <View style={[styles.col, { width: '45%', justifyContent: 'space-between' }]}>
              <Text style={styles.textSmall}>1. OFFICE/DEPARTMENT</Text>
              <Text style={[styles.bold, styles.uppercase, styles.center]}>{officeDepartment}</Text>
            </View>
            <View style={[styles.colNoBorder, { width: '55%', justifyContent: 'space-between' }]}>
              <View style={styles.flexRow}>
                <Text style={[styles.textSmall, { width: 60 }]}>2. NAME :</Text>
                <View style={[styles.flexRow, { flex: 1 }]}>
                  <Text style={[styles.textSmaller, styles.center, { flex: 1 }]}>(Last)</Text>
                  <Text style={[styles.textSmaller, styles.center, { flex: 1 }]}>(First)</Text>
                  <Text style={[styles.textSmaller, styles.center, { flex: 1 }]}>(Middle)</Text>
                </View>
              </View>
              <View style={styles.flexRow}>
                <View style={{ width: 60 }}></View>
                <View style={[styles.flexRow, { flex: 1 }]}>
                  <Text style={[styles.bold, styles.uppercase, styles.center, { flex: 1 }]}>{nameParts.lastName || ' '}</Text>
                  <Text style={[styles.bold, styles.uppercase, styles.center, { flex: 1 }]}>{nameParts.firstName || ' '}</Text>
                  <Text style={[styles.bold, styles.uppercase, styles.center, { flex: 1 }]}>{nameParts.middleName || ' '}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Row 2 */}
          <View style={[styles.row, { minHeight: 35, paddingBottom: 2 }]}>
            <View style={[styles.col, styles.flexRowItemsEnd, { width: '30%', paddingBottom: 2, paddingRight: 0 }]}>
              <Text style={styles.textSmall}>3. DATE OF FILING:</Text>
              <View style={styles.underlineContainer}>
                <Text style={[styles.bold, styles.center]}>{dateFiled}</Text>
              </View>
            </View>
            <View style={[styles.col, styles.flexRowItemsEnd, { width: '45%', paddingBottom: 2, paddingRight: 0 }]}>
              <Text style={styles.textSmall}>4. POSITION</Text>
              <View style={styles.underlineContainer}>
                <Text style={[styles.bold, styles.center, styles.uppercase, { fontSize: position?.length > 25 ? 7 : 9 }]}>{position}</Text>
              </View>
            </View>
            <View style={[styles.colNoBorder, styles.flexRowItemsEnd, { width: '25%', paddingBottom: 2, paddingRight: 0 }]}>
              <Text style={styles.textSmall}>5. SALARY GRADE:</Text>
              <View style={styles.underlineContainer}>
                <Text style={[styles.bold, styles.center]}>{salaryGrade}</Text>
              </View>
            </View>
          </View>

          {/* Section 6 */}
          <Text style={styles.sectionTitle}>6. DETAILS OF APPLICATION</Text>

          {/* Row 3 */}
          <View style={[styles.row, { minHeight: 140 }]}>
            <View style={[styles.col, { width: '50%', paddingBottom: 15 }]}>
              <Text style={[styles.textSmall, styles.uppercase, styles.mb2]}>6.A TYPE OF CDO TO BE AVAILED</Text>
              <View style={[styles.flexRow, styles.mb1, { alignItems: 'center', paddingHorizontal: 8 }]}>
                <View style={styles.checkbox}><Text style={styles.checkMark}>X</Text></View>
                <Text style={[styles.textSmall, { marginLeft: 8 }]}>Ordinary</Text>
              </View>
              <View style={[styles.flexRow, styles.mb1, { alignItems: 'center', paddingHorizontal: 8 }]}>
                <View style={styles.checkbox}></View>
                <Text style={[styles.textSmall, { marginLeft: 8 }]}>Declaration of Health Emergency/Calamity</Text>
              </View>
              <View style={[styles.flexRow, { alignItems: 'center', paddingHorizontal: 8 }]}>
                <View style={styles.checkbox}></View>
                <Text style={[styles.textSmall, { marginLeft: 8 }]}>Interfaith/Cultural Observance</Text>
              </View>
            </View>

            <View style={[styles.colNoBorder, { width: '50%' }]}>
              <Text style={[styles.textSmall, styles.uppercase]}>6.B DETAILS OF CDO</Text>
              <View style={[styles.flexRowItemsEnd, styles.mt1, { paddingHorizontal: 12 }]}>
                <Text style={styles.italic}>Where day-off will be spent: </Text>
                <View style={styles.underlineContainer}>
                  <Text style={[styles.bold, styles.uppercase, styles.center]}>{leaveDetailSpecify || ' '}</Text>
                </View>
              </View>
              <Text style={[styles.textSmall, styles.uppercase, styles.mt2]}>6.C NUMBER OF WORKING DAYS APPLIED FOR</Text>
              <View style={{ paddingHorizontal: 16, marginTop: 4 }}>
                <View style={styles.underlineBox}>
                  <Text style={styles.bold}>{requestedDays}</Text>
                </View>
                <Text style={[styles.textSmall, styles.mt1, { marginLeft: 4 }]}>INCLUSIVE DATES</Text>
                <View style={styles.underlineBox}>
                  <Text style={styles.bold}>{inclusiveDates}</Text>
                </View>
              </View>
              
              <View style={{ marginTop: 30, alignItems: 'center' }}>
                <View style={styles.signatureLine} />
                <Text style={[styles.textSmaller, styles.mt1]}>Signature over Printed Name</Text>
              </View>
            </View>
          </View>

          {/* Section 7 */}
          <Text style={styles.sectionTitle}>7. DETAILS OF ACTION ON APPLICATION</Text>

          {/* Action Row 1 */}
          <View style={[styles.row, { minHeight: 120 }]}>
            <View style={[styles.col, { width: '50%', justifyContent: 'space-between' }]}>
              <Text style={styles.textSmall}>7.A <Text style={styles.uppercase}>DATE OF USE MEMBERSHIP</Text> <Text style={styles.italic}>(For verification of USE Staff)</Text></Text>
              <View style={{ alignItems: 'center', paddingBottom: 10 }}>
                <View style={styles.signatureLineSmall} />
                <Text style={[styles.textSmall, styles.mt1]}>(Authorize Officer)</Text>
              </View>
            </View>
            <View style={[styles.colNoBorder, { width: '50%', justifyContent: 'space-between' }]}>
              <Text style={[styles.textSmall, styles.uppercase]}>7.B VERIFIED BY:</Text>
              <View style={{ alignItems: 'center', marginTop: 20 }}>
                <Text style={[styles.bold, { fontSize: 10 }, styles.uppercase]}>{signatories?.chapter?.name || 'RANDOLF M. LADERAS'}</Text>
                <View style={[styles.signatureLineSmall, { width: '90%', marginTop: 2 }]} />
                <Text style={[styles.textSmall, styles.center, styles.mt1]}>{signatories?.chapter?.position || 'Supervising Statistical Specialist/Chapter Officer'}</Text>
              </View>
              <View style={[styles.flexRowItemsEnd, { paddingLeft: 8, paddingBottom: 8 }]}>
                <Text style={styles.textSmall}>Date:</Text>
                <View style={[styles.signatureLineAction, { marginLeft: 4 }]} />
              </View>
            </View>
          </View>

          {/* Action Row 2 */}
          <View style={[styles.rowNoBorder, { minHeight: 120 }]}>
            <View style={[styles.col, { width: '50%', justifyContent: 'space-between' }]}>
              <Text style={[styles.textSmall, styles.uppercase]}>7.C NOTED BY:</Text>
              <View style={{ alignItems: 'center', marginTop: 20 }}>
                <Text style={[styles.bold, { fontSize: 10 }, styles.uppercase]}>{signatories?.hr?.name || 'DONAH GRACE C. CAPULAC'}</Text>
                <View style={[styles.signatureLineSmall, { width: '90%', marginTop: 2, borderBottomWidth: 0 }]} />
                <Text style={styles.textSmall}>{signatories?.hr?.position || 'AO I - HR Designate'}</Text>
              </View>
              <View style={[styles.flexRowItemsEnd, { paddingLeft: 8, paddingBottom: 8 }]}>
                <Text style={styles.textSmall}>Date:</Text>
                <View style={[styles.signatureLineAction, { marginLeft: 4 }]} />
              </View>
            </View>
            <View style={[styles.colNoBorder, { width: '50%', justifyContent: 'space-between' }]}>
              <Text style={[styles.textSmall, styles.uppercase]}>7.D APPROVED BY:</Text>
              <View style={{ alignItems: 'center', marginTop: 20 }}>
                <Text style={[styles.bold, { fontSize: 10 }, styles.uppercase]}>{signatories?.chief?.name || 'MARIBEL M. DALAYDAY'}</Text>
                <View style={[styles.signatureLineSmall, { width: '90%', marginTop: 2, borderBottomWidth: 0 }]} />
                <Text style={styles.textSmall}>{signatories?.chief?.position || 'Chief Statistical Specialist'}</Text>
              </View>
              <View style={[styles.flexRowItemsEnd, { paddingLeft: 8, paddingBottom: 8 }]}>
                <Text style={styles.textSmall}>Date:</Text>
                <View style={[styles.signatureLineAction, { marginLeft: 4 }]} />
              </View>
            </View>
          </View>
        </View>

        {/* Footer Notes */}
        <View style={{ marginTop: 10, paddingBottom: 10 }}>
          <Text style={[styles.italic, styles.textSmall, { color: '#334155' }]}>Note: To be availed of USE Members Only</Text>
          <Text style={[styles.italic, styles.textSmall, { color: '#334155' }]}>Per 2025-2029 Collective Negotiation Agreement Section 8 of Article II</Text>
        </View>
        
        <Text style={[styles.italic, { fontSize: 8, color: '#334155', position: 'absolute', bottom: 15, right: 25 }]}>Rev. No 1</Text>

      </Page>
    </Document>
  );
}
