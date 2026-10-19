import Link from "next/link";
import { notFound } from "next/navigation";
import { ConsultationService } from "@/backend/service/consultation.service";
import { getAuthUserFromCookies } from "@/shared/auth/get-auth-user-server";
import { ArrowLeft, User, Activity, FileText, Pill, Stethoscope, Download, FileUp, Clock } from "lucide-react";

export default async function ConsultationDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authUser = await getAuthUserFromCookies();
  const data = await ConsultationService.getConsultationReportData(authUser, id).catch(() => null);

  if (!data) {
    notFound();
  }

  const emr = data.emr_notes?.[0] || {};
  const prescriptions = data.prescriptions?.[0] || {};
  const patient = (data.patients as any) || {};
  
  let chiefComplaints: string[] = [];
  try { chiefComplaints = JSON.parse(emr.chief_complaint || "[]"); } catch(e){}
  
  let assessment: any = {};
  try { assessment = JSON.parse(emr.assessment || "{}"); } catch(e){}

  let findings: any = {};
  try { findings = JSON.parse(emr.objective_findings || "{}"); } catch(e){}

  const vitals = findings.vitals || {};
  const rxItems = prescriptions.prescription_items || [];
  const rxNotes = prescriptions.dietary_advice || prescriptions.lifestyle_advice || emr.plan;

  // Patient placeholders
  const bloodGroup = "N/A"; // Placeholder
  const address = patient.city || "N/A";
  const email = "N/A"; // Placeholder

  return (
    <div className="min-h-screen bg-gray-50/50 pb-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Area */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <Link href="/pro/prescriptions" className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-indigo-600 transition-colors mb-3">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Prescriptions
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
              Consultation Details
              <span className="px-2.5 py-1 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-md uppercase tracking-wider">Completed</span>
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              ID: {id.split('-')[0].toUpperCase()} • {new Date(data.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          </div>
          
          <Link href={`/api/consultations/${id}/pdf`} target="_blank">
            <button className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl shadow-sm shadow-indigo-600/20 transition-all">
              <Download className="w-4 h-4" />
              Download PDF
            </button>
          </Link>
        </div>

        <div className="space-y-6">
          {/* Section 1: Patient Information */}
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-5 flex items-center gap-2">
              <User className="w-5 h-5 text-indigo-500" />
              Patient Information
            </h2>
            <div className="flex flex-col md:flex-row gap-6 items-start">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-2xl shadow-sm flex-shrink-0">
                {patient.full_name?.charAt(0) || "P"}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 flex-1 w-full">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Full Name</p>
                  <p className="text-sm font-semibold text-gray-900">{patient.full_name || "N/A"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Age & Gender</p>
                  <p className="text-sm font-medium text-gray-900">{patient.age || "N/A"} y / {patient.gender || "N/A"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Blood Group</p>
                  <p className="text-sm font-medium text-gray-900">{bloodGroup}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Mobile Number</p>
                  <p className="text-sm font-medium text-gray-900">{patient.user?.mobile || patient.phone || "N/A"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Email</p>
                  <p className="text-sm font-medium text-gray-900">{email}</p>
                </div>
                <div className="lg:col-span-3">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Address</p>
                  <p className="text-sm font-medium text-gray-900">{address}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Consultation Details */}
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-5 flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-indigo-500" />
              Consultation Details
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {assessment.visitReason && (
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Visit Reason</p>
                  <p className="text-sm text-gray-900">{assessment.visitReason}</p>
                </div>
              )}
              {chiefComplaints.length > 0 && (
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Chief Complaints</p>
                  <div className="flex flex-wrap gap-2">
                    {chiefComplaints.map((c, i) => (
                      <span key={i} className="px-2 py-1 bg-white border border-gray-200 rounded-md text-sm text-gray-700">{c}</span>
                    ))}
                  </div>
                </div>
              )}
              {emr.history_present && (
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 lg:col-span-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">History of Present Illness</p>
                  <p className="text-sm text-gray-900">{emr.history_present}</p>
                </div>
              )}
              {assessment.previousHistory && (
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Previous History</p>
                  <p className="text-sm text-gray-900">{assessment.previousHistory}</p>
                </div>
              )}
              {assessment.previousCalls && (
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Previous Calls</p>
                  <p className="text-sm text-gray-900">{assessment.previousCalls}</p>
                </div>
              )}
            </div>
            {!(assessment.visitReason || chiefComplaints.length > 0 || emr.history_present || assessment.previousHistory || assessment.previousCalls) && (
              <p className="text-sm text-gray-500 italic">No detailed consultation notes recorded.</p>
            )}
          </section>

          {/* Section 3: Recorded Vitals */}
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-5 flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-500" />
              Recorded Vitals
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100/50 flex flex-col items-center justify-center text-center">
                <p className="text-xs font-medium text-indigo-600/70 uppercase tracking-wider mb-1">Blood Pressure</p>
                <p className="text-lg font-semibold text-indigo-900">
                  {vitals.bpSys && vitals.bpDia ? `${vitals.bpSys}/${vitals.bpDia}` : "—"}
                  {vitals.bpSys && <span className="text-xs font-normal text-indigo-600/70 ml-1">mmHg</span>}
                </p>
              </div>
              <div className="p-4 bg-rose-50/50 rounded-xl border border-rose-100/50 flex flex-col items-center justify-center text-center">
                <p className="text-xs font-medium text-rose-600/70 uppercase tracking-wider mb-1">Pulse</p>
                <p className="text-lg font-semibold text-rose-900">
                  {vitals.pulse || "—"}
                  {vitals.pulse && <span className="text-xs font-normal text-rose-600/70 ml-1">bpm</span>}
                </p>
              </div>
              <div className="p-4 bg-amber-50/50 rounded-xl border border-amber-100/50 flex flex-col items-center justify-center text-center">
                <p className="text-xs font-medium text-amber-600/70 uppercase tracking-wider mb-1">Temperature</p>
                <p className="text-lg font-semibold text-amber-900">
                  {vitals.temp || "—"}
                  {vitals.temp && <span className="text-xs font-normal text-amber-600/70 ml-1">°F</span>}
                </p>
              </div>
              <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100/50 flex flex-col items-center justify-center text-center">
                <p className="text-xs font-medium text-blue-600/70 uppercase tracking-wider mb-1">SpO₂</p>
                <p className="text-lg font-semibold text-blue-900">
                  {vitals.spo2 || "—"}
                  {vitals.spo2 && <span className="text-xs font-normal text-blue-600/70 ml-1">%</span>}
                </p>
              </div>
              <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100/50 flex flex-col items-center justify-center text-center">
                <p className="text-xs font-medium text-emerald-600/70 uppercase tracking-wider mb-1">Weight</p>
                <p className="text-lg font-semibold text-emerald-900">
                  {vitals.weight || "—"}
                  {vitals.weight && <span className="text-xs font-normal text-emerald-600/70 ml-1">kg</span>}
                </p>
              </div>
              <div className="p-4 bg-purple-50/50 rounded-xl border border-purple-100/50 flex flex-col items-center justify-center text-center">
                <p className="text-xs font-medium text-purple-600/70 uppercase tracking-wider mb-1">BMI</p>
                <p className="text-lg font-semibold text-purple-900">
                  {vitals.bmi || "—"}
                </p>
              </div>
            </div>
          </section>

          {/* Section 4: Prescription */}
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 overflow-hidden">
            <h2 className="text-lg font-semibold text-gray-900 mb-5 flex items-center gap-2">
              <Pill className="w-5 h-5 text-indigo-500" />
              Prescription Formulations
            </h2>
            {rxItems.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <th className="p-4">Medicine Name</th>
                      <th className="p-4">Form & Dose</th>
                      <th className="p-4">Timing & Anupana</th>
                      <th className="p-4">Duration</th>
                      <th className="p-4">Instructions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {rxItems.map((item: any, i: number) => (
                      <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                        <td className="p-4 text-sm font-semibold text-gray-900">{item.medicine_name}</td>
                        <td className="p-4 text-sm text-gray-700">{item.dose || "—"}</td>
                        <td className="p-4 text-sm text-gray-700">
                          {item.frequency}
                          {item.anupana && <div className="text-xs text-gray-500 mt-0.5">with {item.anupana}</div>}
                        </td>
                        <td className="p-4 text-sm text-gray-700">{item.duration_days ? `${item.duration_days} days` : "—"}</td>
                        <td className="p-4 text-sm text-gray-600 italic">{item.special_instructions || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center bg-gray-50 rounded-xl border border-gray-200 border-dashed">
                <p className="text-sm text-gray-500 font-medium">No medicines prescribed during this consultation.</p>
              </div>
            )}
          </section>

          {/* Section 5: Additional Instructions & Notes */}
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-5 flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-500" />
              Additional Instructions & Notes
            </h2>
            {rxNotes ? (
              <div 
                className="prose prose-sm max-w-none text-gray-700 bg-amber-50/30 p-5 rounded-xl border border-amber-100/50
                  [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_p]:mb-3 last:[&_p]:mb-0"
                dangerouslySetInnerHTML={{ __html: rxNotes }} 
              />
            ) : (
              <p className="text-sm text-gray-500 italic">No additional notes provided.</p>
            )}
          </section>

          {/* Section 6: Uploaded Reports */}
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-5 flex items-center gap-2">
              <FileUp className="w-5 h-5 text-indigo-500" />
              Uploaded Reports
            </h2>
            {/* Using an empty state since actual file saving logic isn't fully implemented in the database yet */}
            <div className="p-8 text-center bg-gray-50 rounded-xl border border-gray-200 border-dashed">
              <FileUp className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-gray-900">No reports uploaded</h3>
              <p className="text-xs text-gray-500 mt-1">There are no files attached to this consultation.</p>
            </div>
          </section>

          {/* Section 7: Follow-up & Notes */}
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-5 flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-500" />
              Follow-up & Care Plan
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-5 bg-indigo-50/50 rounded-xl border border-indigo-100">
                <p className="text-xs font-medium text-indigo-600/80 uppercase tracking-wider mb-2">Next Follow-up Date</p>
                <p className="text-base font-semibold text-indigo-900">
                  {prescriptions.followup_date ? new Date(prescriptions.followup_date).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : "Not Scheduled"}
                </p>
              </div>
              <div className="p-5 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Follow-up Instructions</p>
                <p className="text-sm text-gray-700">
                  {prescriptions.lifestyle_advice || "No specific follow-up instructions provided."}
                </p>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
