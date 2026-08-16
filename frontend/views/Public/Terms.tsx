
import React from 'react';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-3">
    <h2 className="text-lg font-bold text-[#2E2E2F] tracking-tight">{title}</h2>
    <div className="text-sm font-medium text-[#2E2E2F]/70 leading-relaxed space-y-3">{children}</div>
  </div>
);

export const Terms: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 lg:py-16">
      <div className="mb-12">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#38BDF2] mb-3">Legal</p>
        <h1 className="text-3xl lg:text-4xl font-black text-[#2E2E2F] tracking-tight mb-3">Terms &amp; Conditions</h1>
        <p className="text-[12px] font-bold uppercase tracking-widest text-[#2E2E2F]/50">Last updated: 16 August 2026</p>
      </div>

      <div className="space-y-10">
        <Section title="1. Acceptance of Terms">
          <p>
            These Terms &amp; Conditions ("Terms") govern your access to and use of the StartupLab Business Center
            event ticketing platform (the "Platform"), including browsing events, registering for events, and
            purchasing tickets. By accessing the Platform or completing a registration, you agree to be bound by
            these Terms. If you do not agree, please do not use the Platform.
          </p>
        </Section>

        <Section title="2. Event Registration">
          <p>
            Registration for an event is confirmed only once your submission has been processed and, where
            applicable, payment has been successfully completed. For free events, your ticket is issued
            immediately upon successful submission of the registration form.
          </p>
          <p>
            You are responsible for ensuring that the name, email address, and other details you provide during
            registration are accurate and up to date, as your ticket and any event communications will be sent to
            the information you supply.
          </p>
        </Section>

        <Section title="3. Tickets & Payments">
          <p>
            Paid tickets are processed through our third-party payment gateway. All payments are subject to the
            payment provider's own terms and security measures. StartupLab Business Center does not store your
            full payment card details.
          </p>
          <p>
            Ticket prices, availability, and registration windows are set individually per event and may change
            without prior notice until a purchase is completed. Once a paid order is confirmed, it is treated as
            final except as described in the Refund Policy below.
          </p>
        </Section>

        <Section title="4. Refund Policy">
          <p>
            Unless otherwise stated on a specific event's registration page, tickets are non-refundable and
            non-transferable. If an event is cancelled or rescheduled by StartupLab Business Center, affected
            registrants will be notified and, where applicable, offered a refund or transfer to an alternate
            session at our discretion.
          </p>
        </Section>

        <Section title="5. Event Changes & Cancellations">
          <p>
            StartupLab Business Center reserves the right to modify event details (including date, time, venue, or
            format), postpone, or cancel an event due to circumstances such as low registration, speaker
            availability, or events beyond our reasonable control. We will make reasonable efforts to notify
            registered attendees of any material changes.
          </p>
        </Section>

        <Section title="6. Attendee Conduct">
          <p>
            By attending an event, you agree to conduct yourself in a professional and respectful manner toward
            organizers, speakers, and fellow attendees. StartupLab Business Center reserves the right to refuse
            entry or remove any attendee whose conduct is disruptive, unlawful, or unsafe, without refund.
          </p>
        </Section>

        <Section title="7. Check-In & Ticket Use">
          <p>
            Each ticket is uniquely issued and may include a QR code used for check-in at the event venue. Tickets
            should not be duplicated, resold, or shared beyond their intended registrant unless the event
            explicitly permits transfers.
          </p>
        </Section>

        <Section title="8. Intellectual Property">
          <p>
            All content on the Platform — including text, graphics, logos, and event materials — is the property
            of StartupLab Business Center or its licensors and is protected by applicable intellectual property
            laws. You may not reproduce or redistribute this content without prior written permission.
          </p>
        </Section>

        <Section title="9. Limitation of Liability">
          <p>
            The Platform and events are provided on an "as is" and "as available" basis. To the fullest extent
            permitted by law, StartupLab Business Center shall not be liable for any indirect, incidental, or
            consequential damages arising from your use of the Platform or attendance at an event.
          </p>
        </Section>

        <Section title="10. Changes to These Terms">
          <p>
            We may update these Terms from time to time to reflect changes in our practices or for legal,
            operational, or regulatory reasons. The "Last updated" date above indicates when these Terms were last
            revised. Continued use of the Platform after changes take effect constitutes your acceptance of the
            revised Terms.
          </p>
        </Section>

        <Section title="11. Contact Us">
          <p>
            If you have any questions about these Terms, please contact the StartupLab Business Center team
            through the event organizer contact details provided on the relevant event page.
          </p>
        </Section>
      </div>
    </div>
  );
};
