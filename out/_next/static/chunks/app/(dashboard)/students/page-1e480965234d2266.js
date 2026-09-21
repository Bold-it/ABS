(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[879],{1005:(e,t,a)=>{Promise.resolve().then(a.bind(a,6995))},3321:(e,t,a)=>{"use strict";var s=a(4645);a.o(s,"usePathname")&&a.d(t,{usePathname:function(){return s.usePathname}}),a.o(s,"useRouter")&&a.d(t,{useRouter:function(){return s.useRouter}}),a.o(s,"useSearchParams")&&a.d(t,{useSearchParams:function(){return s.useSearchParams}})},6995:(e,t,a)=>{"use strict";a.r(t),a.d(t,{default:()=>d});var s=a(5155),r=a(2115),i=a(3321);function l(){let e=(0,i.useSearchParams)().get("status")||"",[t,a]=(0,r.useState)([]),[l,d]=(0,r.useState)(!0),[c,p]=(0,r.useState)(!1),[x,m]=(0,r.useState)(""),[h,g]=(0,r.useState)(e),[u,b]=(0,r.useState)(null),y=(0,i.useRouter)(),f=async()=>{let e=localStorage.getItem("abs_token"),t=new URL("/api/admin/students",window.location.origin);x&&t.searchParams.append("search",x),h&&t.searchParams.append("status",h);try{let s=await fetch(t.toString(),{headers:{Authorization:`Bearer ${e}`}}),r=await s.json();a(r.items||[])}catch(e){console.error(e)}finally{d(!1)}};(0,r.useEffect)(()=>{f()},[x,h]);let w=async e=>{let t=localStorage.getItem("abs_token");if(confirm("Are you sure you want to force manifest activation? This bypasses the fee threshold check."))try{let a=await fetch(`/api/admin/activate/${e}`,{method:"POST",headers:{Authorization:`Bearer ${t}`}}),s=await a.json();alert(s.message||"Job queued"),f()}catch(e){alert(e.message||"Error occurred")}},v=async()=>{if(!confirm("Pull and onboard past uncaptured admitted students from SOIS?\n\nABS will automatically:\n1. Provision their @htu.edu.gh Google Workspace emails\n2. Create their Moodle LMS accounts\n3. Activate their status\n4. Send them a Welcome SMS with credentials!"))return;let e=localStorage.getItem("abs_token");try{let t=await fetch("/api/admin/students/sync-sois-admissions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${e}`},body:JSON.stringify({year:"2025/2026",term:"1"})}),a=await t.json();alert(`SOIS Admissions Sync Complete!
Total Fetched: ${a.totalFetched||0}
New Students Admitted: ${a.newStudentsAdmitted||0}
Students Onboarded (Email & Moodle): ${a.studentsOnboarded||0}`),f()}catch(e){alert("Sync error: "+e.message)}},j=async()=>{if(!confirm("Import all 1,014 missed admission student records into ABS?\n\nABS will:\n1. Insert all 1,014 records into ABS Registry\n2. Provision Google Workspace Emails (@htu.edu.gh)\n3. Create Moodle LMS Accounts\n4. Send Welcome SMS credentials!"))return;let e=localStorage.getItem("abs_token");try{let t=await fetch("/api/admin/students/import-missed",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${e}`}}),a=await t.json();alert(`Missed Admissions Import Complete!

Total Processed: ${a.totalImported||0}
New Students Added: ${a.newStudentsAdded||0}
Already Existed: ${a.alreadyExisted||0}
Students Onboarded (Google & Moodle): ${a.studentsOnboarded||0}`),f()}catch(e){alert("Import error: "+e.message)}},N=async(e,t)=>{if(!confirm(`Are you sure you want to permanently delete "${t}"?

This will remove the student record from ABS.`))return;let a=localStorage.getItem("abs_token");try{let t=await fetch(`/api/admin/students/${e}`,{method:"DELETE",headers:{Authorization:`Bearer ${a}`}}),s=await t.json();alert(s.message||"Student record deleted"),f()}catch(e){alert(e.message||"Error deleting student")}};return(0,s.jsxs)("div",{className:"relative min-h-full",children:[(0,s.jsxs)("div",{className:"flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-4 mb-8",children:[(0,s.jsxs)("div",{className:"flex flex-col md:flex-row gap-4 flex-1",children:[(0,s.jsxs)("div",{className:"relative w-full md:w-96",children:[(0,s.jsx)("input",{type:"text",placeholder:"Search by name or index...",value:x,onChange:e=>m(e.target.value),className:"w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary focus:border-transparent outline-none shadow-sm bg-white"}),(0,s.jsx)("span",{className:"absolute left-3 top-3.5 opacity-40",children:"\uD83D\uDD0D"})]}),(0,s.jsx)("div",{className:"flex gap-2 overflow-x-auto pb-2 md:pb-0",children:["","PENDING","ADMITTED","ACTIVE","RESTRICTED"].map(e=>(0,s.jsx)("button",{onClick:()=>g(e),className:`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${h===e?"bg-primary text-white shadow-md":"bg-white text-gray-500 border border-gray-100 hover:bg-gray-50"}`,children:e||"ALL"},e))})]}),(0,s.jsxs)("div",{className:"flex flex-wrap gap-2 justify-end",children:[(0,s.jsxs)("button",{onClick:j,className:"px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white text-xs font-black rounded-xl shadow hover:shadow-lg transition-all uppercase tracking-wider flex items-center gap-2",children:[(0,s.jsx)("span",{children:"\uD83D\uDCE5"})," Import Missed (1,014)"]}),(0,s.jsxs)("button",{onClick:v,className:"px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow hover:shadow-lg transition-all uppercase tracking-wider flex items-center gap-2",children:[(0,s.jsx)("span",{children:"⚡"})," Pull SOIS Admissions"]}),(0,s.jsxs)("button",{onClick:()=>{if(0===t.length)return void alert("No student data available to export.");let e=encodeURI("data:text/csv;charset=utf-8,"+["ID,Full Name,Admission/Index Number,Programme,Level,Fees Paid %,Status,Moodle Provisioned",...t.map(e=>[e.id,e.fullName,e.indexNumber||e.admissionId,e.programme,e.level,`${e.paymentPercentage}%`,e.state,e.moodleAccountCreated?"YES":"NO"]).map(e=>e.map(e=>`"${e}"`).join(","))].join("\n")),a=document.createElement("a");a.setAttribute("href",e),a.setAttribute("download",`HTU_LMS_Student_Report_${h||"ALL"}.csv`),document.body.appendChild(a),a.click(),document.body.removeChild(a)},className:"px-4 py-3 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-black rounded-xl hover:shadow transition-all uppercase tracking-wider flex items-center gap-2",children:[(0,s.jsx)("span",{children:"\uD83D\uDCCA"})," Export CSV"]}),(0,s.jsxs)("button",{onClick:()=>{if(0===t.length)return void alert("No student data available to generate report.");let e=window.open("","_blank");if(!e)return void alert("Please allow popups to view the report.");let a=t.length,s=t.filter(e=>"ACTIVE"===e.state).length,r=t.filter(e=>"RESTRICTED"===e.state).length;t.filter(e=>"PENDING"===e.state).length;let i=Math.round(t.reduce((e,t)=>e+t.paymentPercentage,0)/a),l=t.map((e,t)=>`
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${t+1}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">${e.fullName}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${e.indexNumber||e.admissionId}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${e.programme} (L${e.level})</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">${e.paymentPercentage}%</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">
          <span style="padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; background: ${"ACTIVE"===e.state?"#D1FAE5; color: #065F46;":"RESTRICTED"===e.state?"#FEE2E2; color: #991B1B;":"#FEF3C7; color: #92400E;"}">${e.state}</span>
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${e.moodleAccountCreated?"\uD83D\uDFE2 Provisioned":"\uD83D\uDD34 Missing"}</td>
      </tr>
    `).join("");e.document.write(`
      <html>
        <head>
          <title>HTU ABS Bridge - Academic & LMS Status Report</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 40px; color: #333; }
            .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #0D3F7C; padding-bottom: 20px; }
            .logo { height: 70px; }
            .title { text-align: right; }
            .title h1 { margin: 0; color: #0D3F7C; font-size: 24px; text-transform: uppercase; }
            .title p { margin: 5px 0 0 0; color: #666; font-size: 12px; font-weight: bold; letter-spacing: 2px; }
            .stats-grid { display: grid; grid-cols: 4; display: flex; justify-content: space-between; margin: 30px 0; gap: 15px; }
            .stat-card { flex: 1; padding: 15px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; text-align: center; }
            .stat-card h3 { margin: 0 0 5px 0; font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
            .stat-card p { margin: 0; font-size: 20px; font-weight: bold; color: #0D3F7C; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
            th { background: #0D3F7C; color: white; padding: 12px; text-align: left; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; }
            .print-btn { display: block; width: 150px; padding: 10px; background: #0D3F7C; color: white; border: none; border-radius: 6px; font-weight: bold; text-align: center; cursor: pointer; text-decoration: none; margin-bottom: 20px; }
            @media print { .print-btn { display: none; } }
          </style>
        </head>
        <body>
          <button class="print-btn" onclick="window.print()">🖨️ Print Report</button>
          
          <div class="header">
            <img class="logo" src="/logo.png" alt="HTU Logo" />
            <div class="title">
              <h1>Ho Technical University</h1>
              <p>LMS Automated Bridge Integration Report</p>
            </div>
          </div>
          
          <div style="margin-top: 20px; font-size: 11px; color: #666;">
            <strong>Generated on:</strong> ${new Date().toLocaleString()} | <strong>Filter Applied:</strong> ${h||"ALL STUDENTS"}
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <h3>Total Students</h3>
              <p>${a}</p>
            </div>
            <div class="stat-card">
              <h3>Active Enrolled</h3>
              <p style="color: #10B981;">${s}</p>
            </div>
            <div class="stat-card">
              <h3>Restricted / Blocked</h3>
              <p style="color: #EF4444;">${r}</p>
            </div>
            <div class="stat-card">
              <h3>Average Fees Paid</h3>
              <p style="color: #F5A623;">${i}%</p>
            </div>
          </div>

          <h2>Student Registry Details</h2>
          <table>
            <thead>
              <tr>
                <th style="width: 5%;">#</th>
                <th style="width: 25%;">Student Name</th>
                <th style="width: 15%;">Index Number</th>
                <th style="width: 25%;">Programme & Level</th>
                <th style="width: 10%;">Fees Paid</th>
                <th style="width: 10%;">Status</th>
                <th style="width: 10%;">Moodle Status</th>
              </tr>
            </thead>
            <tbody>
              ${l}
            </tbody>
          </table>
          
          <div style="margin-top: 50px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 15px;">
            Ho Technical University Auto Bridge Service \xa9 2026. This report was dynamically generated.
          </div>
        </body>
      </html>
    `),e.document.close()},className:"px-4 py-3 bg-primary text-white hover:opacity-90 text-xs font-black rounded-xl hover:shadow transition-all uppercase tracking-wider flex items-center gap-2",children:[(0,s.jsx)("span",{children:"✨"})," Smart Report"]})]})]}),(0,s.jsx)("div",{className:"bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden",children:(0,s.jsx)("div",{className:"overflow-x-auto",children:(0,s.jsxs)("table",{className:"w-full text-left",children:[(0,s.jsx)("thead",{children:(0,s.jsxs)("tr",{className:"bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest",children:[(0,s.jsx)("th",{className:"px-6 py-4",children:"Student"}),(0,s.jsx)("th",{className:"px-6 py-4",children:"Programme / Level"}),(0,s.jsx)("th",{className:"px-6 py-4",children:"Fees Paid"}),(0,s.jsx)("th",{className:"px-6 py-4",children:"Status"}),(0,s.jsx)("th",{className:"px-6 py-4",children:"Moodle"}),(0,s.jsx)("th",{className:"px-6 py-4",children:"Actions"})]})}),(0,s.jsx)("tbody",{className:"divide-y divide-gray-50",children:t.map(e=>(0,s.jsxs)("tr",{className:"hover:bg-primary-light/30 transition-colors cursor-pointer group",onClick:()=>y.push(`/students/profile?id=${e.id}`),children:[(0,s.jsxs)("td",{className:"px-6 py-4",children:[(0,s.jsx)("p",{className:"font-bold text-gray-800 group-hover:text-primary",children:e.fullName}),(0,s.jsx)("p",{className:"text-xs text-gray-400 font-medium font-mono",children:e.indexNumber||e.admissionId})]}),(0,s.jsxs)("td",{className:"px-6 py-4",children:[(0,s.jsx)("p",{className:"text-sm font-bold text-gray-600",children:e.programme}),(0,s.jsxs)("p",{className:"text-xs text-gray-400 font-medium",children:["Level ",e.level]})]}),(0,s.jsx)("td",{className:"px-6 py-4 w-48",children:(0,s.jsxs)("div",{className:"flex items-center gap-2",children:[(0,s.jsx)("div",{className:"flex-1 h-2 bg-gray-100 rounded-full overflow-hidden",children:(0,s.jsx)("div",{className:`h-full transition-all duration-500 ${e.paymentPercentage>=60?"bg-green-500":"bg-primary"}`,style:{width:`${e.paymentPercentage}%`}})}),(0,s.jsxs)("span",{className:"text-xs font-black text-gray-700",children:[e.paymentPercentage,"%"]})]})}),(0,s.jsx)("td",{className:"px-6 py-4",children:(0,s.jsx)(o,{state:e.state})}),(0,s.jsx)("td",{className:"px-6 py-4",children:e.moodleAccountCreated?(0,s.jsxs)("div",{className:"flex items-center gap-1.5 text-xs font-bold text-green-500",children:[(0,s.jsx)("span",{className:"w-2 h-2 bg-green-500 rounded-full"})," Provisioned"]}):(0,s.jsxs)("div",{className:"flex items-center gap-1.5 text-xs font-bold text-gray-300",children:[(0,s.jsx)("span",{className:"w-2 h-2 bg-gray-300 rounded-full"})," Missing"]})}),(0,s.jsxs)("td",{className:"px-6 py-4 flex gap-2",onClick:e=>e.stopPropagation(),children:[(0,s.jsx)("button",{onClick:()=>y.push(`/students/profile?id=${e.id}`),className:"px-4 py-2 bg-gray-50 border border-gray-200 text-gray-500 text-[10px] font-black rounded-lg hover:bg-gray-100 transition-all uppercase tracking-widest",children:"VIEW PROFILE"}),(0,s.jsx)("button",{disabled:e.moodleAccountCreated,onClick:()=>w(e.id),className:"px-4 py-2 bg-white border border-gray-200 text-primary text-[10px] font-black rounded-lg hover:bg-primary hover:text-white transition-all disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-primary uppercase tracking-widest",children:"FORCE SYNC"}),(0,s.jsx)("button",{onClick:()=>N(e.id,e.fullName),title:"Delete Student Record",className:"px-3 py-2 bg-red-50 border border-red-200 text-red-600 text-[10px] font-black rounded-lg hover:bg-red-600 hover:text-white transition-all uppercase tracking-widest",children:"\uD83D\uDDD1️"})]})]},e.id))})]})})}),c&&u&&(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)("div",{className:"fixed inset-0 bg-black/20 z-40 backdrop-blur-sm",onClick:()=>p(!1)}),(0,s.jsxs)("div",{className:"fixed right-0 top-0 h-screen w-full max-w-xl bg-white z-50 shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300",children:[(0,s.jsxs)("div",{className:"p-8 border-b border-gray-100 flex justify-between items-center bg-primary text-white",children:[(0,s.jsxs)("div",{children:[(0,s.jsx)("h2",{className:"text-2xl font-black",children:u.student.fullName}),(0,s.jsx)("p",{className:"opacity-70 font-mono text-sm",children:u.student.indexNumber||u.student.admissionId})]}),(0,s.jsx)("button",{onClick:()=>p(!1),className:"w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-xl",children:"✕"})]}),(0,s.jsxs)("div",{className:"p-8 space-y-10",children:[(0,s.jsxs)("section",{children:[(0,s.jsx)("h4",{className:"text-xs font-black text-gray-400 uppercase tracking-widest mb-4",children:"Account Information"}),(0,s.jsxs)("div",{className:"grid grid-cols-2 gap-4",children:[(0,s.jsx)(n,{label:"School Email",value:u.student.schoolEmail||"Not provisioned"}),(0,s.jsx)(n,{label:"Personal Email",value:u.student.email}),(0,s.jsx)(n,{label:"Phone Number",value:u.student.phone}),(0,s.jsx)(n,{label:"Moodle ID",value:u.student.moodleUserId||"None"})]})]}),(0,s.jsxs)("section",{children:[(0,s.jsx)("h4",{className:"text-xs font-black text-gray-400 uppercase tracking-widest mb-4",children:"ABS Automation History"}),(0,s.jsx)("div",{className:"space-y-4",children:u.logs.length>0?u.logs.map(e=>(0,s.jsxs)("div",{className:"flex gap-4 items-start",children:[(0,s.jsx)("div",{className:"w-2 h-2 mt-1.5 rounded-full bg-primary shrink-0"}),(0,s.jsxs)("div",{children:[(0,s.jsx)("p",{className:"text-sm font-bold text-gray-800",children:e.action}),(0,s.jsx)("p",{className:"text-xs text-gray-400",children:e.details}),(0,s.jsx)("p",{className:"text-[10px] font-medium text-gray-300 mt-1 uppercase",children:new Date(e.timestamp).toLocaleString()})]})]},e.id)):(0,s.jsx)("p",{className:"text-sm text-gray-400 italic",children:"No automation logs recorded for this student yet."})})]}),(0,s.jsxs)("section",{children:[(0,s.jsx)("h4",{className:"text-xs font-black text-gray-400 uppercase tracking-widest mb-4",children:"Payment Timeline"}),(0,s.jsx)("div",{className:"space-y-3",children:u.payments.map(e=>(0,s.jsxs)("div",{className:"p-4 rounded-xl bg-gray-50 border border-gray-100 flex justify-between items-center",children:[(0,s.jsxs)("div",{children:[(0,s.jsxs)("p",{className:"text-xs font-black text-gray-400 uppercase tracking-tighter",children:["REF: ",e.reference]}),(0,s.jsxs)("p",{className:"text-sm font-bold text-primary mt-0.5",children:["+",(e.amount/100).toLocaleString()," GHS"]})]}),(0,s.jsxs)("div",{className:"text-right",children:[(0,s.jsxs)("p",{className:"text-xs font-bold text-gray-500",children:[e.percentage,"% Total"]}),(0,s.jsx)("p",{className:"text-[10px] font-medium text-gray-300 uppercase",children:new Date(e.paidAt).toLocaleDateString()})]})]},e.id))})]})]})]})]})]})}function o({state:e}){return(0,s.jsx)("span",{className:`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${{PENDING:"bg-gray-100 text-gray-500",ADMITTED:"bg-blue-100 text-blue-500",ACTIVE:"bg-green-100 text-green-500",RESTRICTED:"bg-red-100 text-red-500"}[e]||"bg-gray-100 text-gray-500"}`,children:e})}function n({label:e,value:t}){return(0,s.jsxs)("div",{className:"p-4 rounded-xl border border-gray-100 bg-gray-50/50",children:[(0,s.jsx)("p",{className:"text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1",children:e}),(0,s.jsx)("p",{className:"text-sm font-bold text-gray-700 truncate",children:t})]})}function d(){return(0,s.jsx)(r.Suspense,{fallback:(0,s.jsx)("div",{className:"p-8 text-primary font-black uppercase tracking-widest animate-pulse",children:"Scanning Registry..."}),children:(0,s.jsx)(l,{})})}}},e=>{e.O(0,[441,794,358],()=>e(e.s=1005)),_N_E=e.O()}]);